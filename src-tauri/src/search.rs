// Search inside the library (spec §7). One walk, one answer: no index, no
// streaming, no query language. A substring search is the same code path as
// a regex one — the substring is simply escaped first.

use std::path::Path;

use ignore::WalkBuilder;
use rayon::prelude::*;
use regex::RegexBuilder;
use serde::{Deserialize, Serialize};

/// Spec §7: bigger than this and the file is skipped, with a note.
const LARGE_FILE: u64 = 2 * 1024 * 1024;
/// Per file. A file that matches more than this is not read any further.
const MAX_MATCHES_PER_FILE: usize = 500;
/// Across the whole answer, so the screen stays a screen.
const MAX_LINES: usize = 2000;

const IGNORED: [&str; 3] = [".git", ".obsidian", "node_modules"];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub root: String,
    pub query: String,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub regex: bool,
    pub extensions: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LineMatch {
    /// 1-based, so it can go straight to `plain:goto-line`.
    line: usize,
    text: String,
    /// UTF-16 offsets, which is what the front end indexes a string by.
    ranges: Vec<[usize; 2]>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMatches {
    path: String,
    /// Relative to the root, `/` separated.
    rel: String,
    name: String,
    matches: Vec<LineMatch>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    files: Vec<FileMatches>,
    /// How many files were over 2 MB.
    skipped_large: usize,
    /// How many refused to be read at all. Saying nothing about them would
    /// turn a permission problem into a confident `no matches` (review #18).
    skipped_unreadable: usize,
    /// A limit was hit; the answer is not the whole truth.
    truncated: bool,
}

fn wanted(name: &str, extensions: &[String]) -> bool {
    let lower = name.to_lowercase();
    extensions.iter().any(|ext| {
        let ext = ext.trim_start_matches('.').to_lowercase();
        !ext.is_empty() && lower.len() > ext.len() + 1 && lower.ends_with(&format!(".{ext}"))
    })
}

fn ignored_dir(name: &str) -> bool {
    name.starts_with('.') || IGNORED.contains(&name)
}

/// A very long line would be a wall of text in a 560px column, so only a
/// window of it is shown — cut around the first match, never from the start,
/// or the match itself could fall outside what is shown (review #19).
const MAX_LINE: usize = 400;
/// How much of the line before the first match the window keeps.
const LEAD: usize = 48;

/// Walks back from `byte` over at most `chars` characters.
fn back(text: &str, byte: usize, chars: usize) -> usize {
    let mut at = byte;
    for _ in 0..chars {
        let Some(previous) = text[..at].chars().next_back() else {
            break;
        };
        at -= previous.len_utf8();
    }
    at
}

/// Walks forward from `byte` until `units` UTF-16 units have gone by.
fn forward(text: &str, byte: usize, units: usize) -> usize {
    let mut at = byte;
    let mut seen = 0;
    for ch in text[byte..].chars() {
        if seen >= units {
            break;
        }
        seen += ch.len_utf16();
        at += ch.len_utf8();
    }
    at
}

/// Byte spans inside `window` to UTF-16 ranges, in one forward walk. The
/// spans are non-overlapping and sorted, so each character is visited once.
fn utf16_ranges(window: &str, spans: &[(usize, usize)], shift: usize) -> Vec<[usize; 2]> {
    let mut ranges = vec![[0usize, 0usize]; spans.len()];
    let mut edges: Vec<(usize, usize, bool)> = Vec::with_capacity(spans.len() * 2);
    for (index, &(from, to)) in spans.iter().enumerate() {
        edges.push((from, index, true));
        edges.push((to, index, false));
    }
    edges.sort_by_key(|(byte, _, _)| *byte);

    let mut at = 0usize;
    let mut units = 0usize;
    for (byte, index, is_start) in edges {
        while at < byte {
            let Some(ch) = window[at..].chars().next() else {
                break;
            };
            units += ch.len_utf16();
            at += ch.len_utf8();
        }
        let value = units + shift;
        if is_start {
            ranges[index][0] = value;
        } else {
            ranges[index][1] = value;
        }
    }
    ranges
}

/// One line of a hit: the window around its first match, and the matches
/// that fall inside it.
fn line_match(line: usize, text: &str, pattern: &regex::Regex) -> Option<LineMatch> {
    // An empty match (`a*`) would report every position; skip those.
    let first = pattern.find_iter(text).find(|m| m.end() > m.start())?;

    let from = back(text, first.start(), LEAD);
    let to = forward(text, from, MAX_LINE);
    let window = &text[from..to];

    let spans: Vec<(usize, usize)> = pattern
        .find_iter(window)
        .filter(|m| m.end() > m.start())
        .map(|m| (m.start(), m.end()))
        .collect();

    let head = if from > 0 { "…" } else { "" };
    let tail = if to < text.len() { "…" } else { "" };
    Some(LineMatch {
        line,
        // The leading ellipsis is one UTF-16 unit, and every range moves
        // with it — units, not the three bytes it takes on disk.
        ranges: utf16_ranges(window, &spans, head.chars().count()),
        text: format!("{head}{window}{tail}"),
    })
}

/// Everything the walk found in one file, before the global cap.
fn scan(text: &str, pattern: &regex::Regex) -> (Vec<LineMatch>, bool) {
    let mut out = Vec::new();
    let mut truncated = false;
    // Split rather than `lines()`: a CR-only document has to break where the
    // editor breaks it, and the caller has already normalized the endings.
    for (index, line) in text.split('\n').enumerate() {
        let Some(found) = line_match(index + 1, line, pattern) else {
            continue;
        };
        out.push(found);
        if out.len() >= MAX_MATCHES_PER_FILE {
            truncated = true;
            break;
        }
    }
    (out, truncated)
}

/// Collects the files to look at. `ignore` does the walking; its gitignore
/// handling is off, because the tree does not use it either (spec §6).
fn candidates(root: &Path, extensions: &[String]) -> Vec<std::path::PathBuf> {
    WalkBuilder::new(root)
        .hidden(false)
        .ignore(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .parents(false)
        .follow_links(false)
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            !entry.file_type().is_some_and(|kind| kind.is_dir()) || !ignored_dir(&name)
        })
        .build()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_some_and(|kind| kind.is_file()))
        .filter(|entry| wanted(&entry.file_name().to_string_lossy(), extensions))
        .map(|entry| entry.into_path())
        .collect()
}

pub fn search(request: &SearchRequest) -> Result<SearchResponse, String> {
    let root = Path::new(&request.root);
    if !root.is_dir() {
        return Err(format!("not a folder: {}", request.root));
    }
    if request.query.is_empty() {
        return Ok(SearchResponse {
            files: Vec::new(),
            skipped_large: 0,
            skipped_unreadable: 0,
            truncated: false,
        });
    }

    let source = if request.regex {
        request.query.clone()
    } else {
        regex::escape(&request.query)
    };
    let pattern = RegexBuilder::new(&source)
        .case_insensitive(!request.case_sensitive)
        .build()
        .map_err(|error| {
            // The multi-line rustc-style message is no use under a text field.
            error
                .to_string()
                .lines()
                .last()
                .unwrap_or("invalid regex")
                .trim()
                .to_string()
        })?;

    let root_text = root.to_string_lossy().into_owned();

    /// What one file turned into: a hit, or a reason there is none.
    enum Outcome {
        Hit(FileMatches, bool),
        TooBig,
        Unreadable,
    }

    let found: Vec<Outcome> = candidates(root, &request.extensions)
        .par_iter()
        .filter_map(|path| {
            let Ok(meta) = std::fs::metadata(path) else {
                return Some(Outcome::Unreadable);
            };
            if meta.len() > LARGE_FILE {
                return Some(Outcome::TooBig);
            }
            let Ok(bytes) = std::fs::read(path) else {
                return Some(Outcome::Unreadable);
            };
            // The same decoding an open uses, so a cp1251 or UTF-16 document
            // is searched as the text it is (review #18).
            let text = crate::fs::decode_bytes(&bytes);
            let text = text.replace("\r\n", "\n").replace('\r', "\n");
            let (matches, truncated) = scan(&text, &pattern);
            if matches.is_empty() {
                return None;
            }
            let full = path.to_string_lossy().into_owned();
            let rel = full
                .strip_prefix(&root_text)
                .unwrap_or(&full)
                .trim_start_matches(['\\', '/'])
                .replace('\\', "/");
            Some(Outcome::Hit(
                FileMatches {
                    name: path
                        .file_name()
                        .map(|name| name.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                    path: full,
                    rel,
                    matches,
                },
                truncated,
            ))
        })
        .collect();

    let mut skipped_large = 0;
    let mut skipped_unreadable = 0;
    let mut truncated = false;
    let mut files: Vec<FileMatches> = Vec::new();
    for outcome in found {
        match outcome {
            Outcome::Hit(file, cut) => {
                truncated |= cut;
                files.push(file);
            }
            Outcome::TooBig => skipped_large += 1,
            Outcome::Unreadable => skipped_unreadable += 1,
        }
    }
    files.sort_by(|a, b| crate::tree::natural_cmp(&a.rel, &b.rel));

    // The global cap, kept exactly: the file that crosses it is cut, not
    // let through whole (review #19).
    let mut lines = 0;
    let mut kept: Vec<FileMatches> = Vec::new();
    for mut file in files {
        if lines >= MAX_LINES {
            truncated = true;
            break;
        }
        if lines + file.matches.len() > MAX_LINES {
            file.matches.truncate(MAX_LINES - lines);
            truncated = true;
        }
        lines += file.matches.len();
        kept.push(file);
    }

    Ok(SearchResponse {
        files: kept,
        skipped_large,
        skipped_unreadable,
        truncated,
    })
}

#[tauri::command]
pub fn search_folder(request: SearchRequest) -> Result<SearchResponse, String> {
    search(&request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// The text a range points at, sliced the way the front end slices it:
    /// by UTF-16 units, which is what a JavaScript string is indexed by.
    fn shown(text: &str, from: usize, to: usize) -> String {
        let units: Vec<u16> = text.encode_utf16().collect();
        let end = to.min(units.len());
        String::from_utf16_lossy(&units[from.min(end)..end])
    }

    fn request(root: &Path, query: &str) -> SearchRequest {
        SearchRequest {
            root: root.to_string_lossy().into_owned(),
            query: query.into(),
            case_sensitive: false,
            regex: false,
            extensions: vec![".md".into()],
        }
    }

    #[test]
    fn finds_a_substring_ignoring_case() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "Plain text\nsomething else\n").unwrap();
        let answer = search(&request(dir.path(), "plain")).unwrap();
        assert_eq!(answer.files.len(), 1);
        assert_eq!(answer.files[0].matches[0].line, 1);
        assert_eq!(answer.files[0].matches[0].ranges, vec![[0, 5]]);
    }

    #[test]
    fn case_sensitive_stops_matching() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "Plain text\n").unwrap();
        let mut req = request(dir.path(), "plain");
        req.case_sensitive = true;
        assert!(search(&req).unwrap().files.is_empty());
    }

    #[test]
    fn regex_is_a_toggle_and_a_bad_one_is_an_error() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "one 42 two\n").unwrap();
        let mut req = request(dir.path(), r"\d+");
        req.regex = true;
        let answer = search(&req).unwrap();
        assert_eq!(answer.files[0].matches[0].ranges, vec![[4, 6]]);

        // The same text is a plain substring when the toggle is off.
        let off = search(&request(dir.path(), r"\d+")).unwrap();
        assert!(off.files.is_empty());

        let mut bad = request(dir.path(), "(unclosed");
        bad.regex = true;
        assert!(search(&bad).is_err());
    }

    #[test]
    fn ranges_are_utf16_offsets() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "привет мир\n").unwrap();
        let answer = search(&request(dir.path(), "мир")).unwrap();
        assert_eq!(answer.files[0].matches[0].ranges, vec![[7, 10]]);
    }

    #[test]
    fn files_over_two_megabytes_are_skipped() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("small.md"), "needle\n").unwrap();
        let big = format!("needle\n{}", "x".repeat(2 * 1024 * 1024));
        fs::write(dir.path().join("big.md"), big).unwrap();
        let answer = search(&request(dir.path(), "needle")).unwrap();
        assert_eq!(answer.skipped_large, 1);
        assert_eq!(answer.files.len(), 1);
        assert_eq!(answer.files[0].name, "small.md");
    }

    /// Review #18: a cp1251 document opens fine, so it has to be searchable.
    #[test]
    fn legacy_encodings_are_searched_as_text() {
        let dir = tempfile::tempdir().unwrap();
        let (bytes, _, _) = encoding_rs::WINDOWS_1251.encode("привет мир\r\nвторая строка\r\n");
        fs::write(dir.path().join("cp1251.md"), &bytes[..]).unwrap();
        // UTF-16 with a BOM, and CR-only endings, which `lines()` used to miss.
        let mut utf16: Vec<u8> = vec![0xFF, 0xFE];
        for unit in "первая\rвторая мир\r".encode_utf16() {
            utf16.extend_from_slice(&unit.to_le_bytes());
        }
        fs::write(dir.path().join("utf16.md"), &utf16).unwrap();

        let answer = search(&request(dir.path(), "мир")).unwrap();
        let hit: Vec<&str> = answer.files.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(hit, vec!["cp1251.md", "utf16.md"]);
        assert_eq!(answer.files[0].matches[0].line, 1);
        assert_eq!(answer.files[0].matches[0].ranges, vec![[7, 10]]);
        // CR alone still ends a line, so this is line 2 and not line 1.
        assert_eq!(answer.files[1].matches[0].line, 2);
    }

    /// Review #19: the window follows the match, and finding it is linear.
    #[test]
    fn a_very_long_line_is_cut_around_its_match() {
        let dir = tempfile::tempdir().unwrap();
        let line = format!("{}needle tail", "x".repeat(100 * 1024));
        fs::write(dir.path().join("long.md"), &line).unwrap();

        let answer = search(&request(dir.path(), "needle")).unwrap();
        let found = &answer.files[0].matches[0];

        // What went wrong before was measured in offsets, not in seconds:
        // the ranges were counted from the start of the whole line, so they
        // landed far outside the 400 units that are shown and the match came
        // back invisible. Both facts below are exact, and neither is a clock.
        assert!(found.text.starts_with('…'), "the head is cut, not the match");
        assert!(
            found.text.chars().count() <= MAX_LINE + 2,
            "the window is the window, whatever the line: {} chars",
            found.text.chars().count()
        );
        let [from, to] = found.ranges[0];
        assert!(to <= MAX_LINE + 1, "the range has to be inside the window");
        assert_eq!(shown(&found.text, from, to), "needle");
    }

    /// The same line with many matches: every one is placed inside the window,
    /// which is only possible if the offsets are counted over the window and
    /// not over the whole line for each match in turn.
    #[test]
    fn many_matches_on_one_long_line_are_all_placed_in_the_window() {
        let dir = tempfile::tempdir().unwrap();
        let line = format!("{}{}", "x".repeat(100 * 1024), "needle-".repeat(200));
        fs::write(dir.path().join("long.md"), &line).unwrap();

        let answer = search(&request(dir.path(), "needle")).unwrap();
        let found = &answer.files[0].matches[0];

        assert!(found.ranges.len() > 10, "the window holds many of them");
        let mut previous = 0;
        for &[from, to] in &found.ranges {
            assert!(from >= previous, "ranges come in order");
            assert!(to <= MAX_LINE + 1, "and every one is inside the window");
            assert_eq!(shown(&found.text, from, to), "needle");
            previous = to;
        }
    }

    /// Review #19: the cap is the cap, including on the file that crosses it.
    #[test]
    fn the_global_line_cap_is_not_overshot() {
        let dir = tempfile::tempdir().unwrap();
        // Two files of 400 matching lines each, well inside the per-file cap.
        for name in ["a.md", "b.md", "c.md", "d.md", "e.md", "f.md"] {
            fs::write(dir.path().join(name), "needle\n".repeat(400)).unwrap();
        }
        let answer = search(&request(dir.path(), "needle")).unwrap();
        let lines: usize = answer.files.iter().map(|f| f.matches.len()).sum();
        assert_eq!(lines, 2000);
        assert!(answer.truncated);
    }

    #[test]
    fn the_ignored_folders_are_not_searched() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join(".git").join("hidden.md"), "needle\n").unwrap();
        fs::create_dir(dir.path().join("node_modules")).unwrap();
        fs::write(
            dir.path().join("node_modules").join("dep.md"),
            "needle\n",
        )
        .unwrap();
        fs::write(dir.path().join("open.md"), "needle\n").unwrap();

        let answer = search(&request(dir.path(), "needle")).unwrap();
        assert_eq!(answer.files.len(), 1);
        assert_eq!(answer.files[0].rel, "open.md");
    }
}
