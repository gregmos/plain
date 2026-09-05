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

/// A very long line would be a wall of text in a 560px column; the window
/// starts at the first match so the match is always on screen.
const MAX_LINE: usize = 400;

fn utf16_len(text: &str) -> usize {
    text.chars().map(char::len_utf16).sum()
}

/// One line of a hit, with the ranges converted from bytes to UTF-16 units.
fn line_match(line: usize, text: &str, spans: &[(usize, usize)]) -> LineMatch {
    let mut ranges = Vec::with_capacity(spans.len());
    for &(from, to) in spans {
        let start = utf16_len(&text[..from]);
        let end = start + utf16_len(&text[from..to]);
        ranges.push([start, end]);
    }
    let mut text = text.to_string();
    if utf16_len(&text) > MAX_LINE {
        // Cut the tail only; the offsets in front of it stay correct.
        let cut = text
            .char_indices()
            .map(|(index, _)| index)
            .find(|index| utf16_len(&text[..*index]) >= MAX_LINE)
            .unwrap_or(text.len());
        text.truncate(cut);
        text.push('…');
        ranges.retain(|[_, end]| *end <= MAX_LINE);
    }
    LineMatch { line, text, ranges }
}

/// Everything the walk found, before the caps are applied.
fn scan(text: &str, pattern: &regex::Regex) -> (Vec<LineMatch>, bool) {
    let mut out = Vec::new();
    let mut truncated = false;
    for (index, line) in text.lines().enumerate() {
        let spans: Vec<(usize, usize)> = pattern
            .find_iter(line)
            // An empty match (`a*`) would report every position; skip those.
            .filter(|m| m.end() > m.start())
            .map(|m| (m.start(), m.end()))
            .collect();
        if spans.is_empty() {
            continue;
        }
        out.push(line_match(index + 1, line, &spans));
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
    let mut found: Vec<(FileMatches, bool, bool)> = candidates(root, &request.extensions)
        .par_iter()
        .filter_map(|path| {
            let size = std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
            if size > LARGE_FILE {
                return Some((
                    FileMatches {
                        path: path.to_string_lossy().into_owned(),
                        rel: String::new(),
                        name: String::new(),
                        matches: Vec::new(),
                    },
                    false,
                    true,
                ));
            }
            let bytes = std::fs::read(path).ok()?;
            let text = String::from_utf8_lossy(&bytes);
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
            Some((
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
                false,
            ))
        })
        .collect();

    let skipped_large = found.iter().filter(|(_, _, large)| *large).count();
    found.retain(|(_, _, large)| !*large);
    let mut truncated = found.iter().any(|(_, cut, _)| *cut);

    let mut files: Vec<FileMatches> = found.into_iter().map(|(file, _, _)| file).collect();
    files.sort_by(|a, b| crate::tree::natural_cmp(&a.rel, &b.rel));

    // The global cap: whole files are dropped rather than half-shown.
    let mut lines = 0;
    let mut kept = Vec::new();
    for file in files {
        if lines >= MAX_LINES {
            truncated = true;
            break;
        }
        lines += file.matches.len();
        kept.push(file);
    }

    Ok(SearchResponse {
        files: kept,
        skipped_large,
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
