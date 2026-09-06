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

/// One line of a hit: the window around its first match, and the parts of
/// the matches that fall inside it.
///
/// The matching happens on the whole line and never on the window. Running
/// the pattern again over a slice would change the text it is looking at:
/// `^` would anchor to the cut instead of the start of the line, `\b` would
/// find boundaries where the cut fell, and a match that runs past the window
/// — `TODO.*done` with the `done` beyond it — would simply stop matching and
/// lose its highlight. So the ranges are found once and then clipped
/// (review #12).
fn line_match(line: usize, text: &str, pattern: &regex::Regex) -> Option<LineMatch> {
    // An empty match (`a*`) would report every position; skip those.
    let found: Vec<(usize, usize)> = pattern
        .find_iter(text)
        .filter(|m| m.end() > m.start())
        .map(|m| (m.start(), m.end()))
        .collect();
    let first = *found.first()?;

    let from = back(text, first.0, LEAD);
    let to = forward(text, from, MAX_LINE);
    let window = &text[from..to];

    // What is visible of each match, in bytes from the start of the window.
    // Both edges are character boundaries already: the window is cut on them
    // and a match cannot start or end inside a character.
    let spans: Vec<(usize, usize)> = found
        .iter()
        .filter_map(|&(start, end)| {
            let visible_start = start.max(from);
            let visible_end = end.min(to);
            (visible_start < visible_end).then_some((visible_start - from, visible_end - from))
        })
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

/// The path of a file inside the library, `/` separated — the same spelling
/// the tree uses for a row.
fn relative(root: &Path, path: &Path) -> String {
    let full = path.to_string_lossy().into_owned();
    let root = root.to_string_lossy();
    full.strip_prefix(root.as_ref())
        .unwrap_or(&full)
        .trim_start_matches(['\\', '/'])
        .replace('\\', "/")
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
            let rel = relative(root, path);
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

/* ------------------------------------------------------- tags (spec §2a) */

/// More than this and the rail is a wall of tags nobody reads.
const MAX_TAGS: usize = 500;
/// Per tag; the library filter does not need every file of a huge tag.
const MAX_TAG_FILES: usize = 500;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    /// Lowercase, without the `#`.
    tag: String,
    /// Every file it is in, however many are listed below.
    count: usize,
    /// Absolute paths of the files it appears in, capped.
    files: Vec<String>,
    /// The list is shorter than `count`: a filter on it is incomplete.
    truncated: bool,
}

/// `#tag`: a `#` at the start of a line or after a space or `(`, then a
/// letter, digit or underscore. `# heading` has a space and is not one, and
/// `##` is not one either, because the second `#` has a `#` in front of it.
fn tag_pattern() -> regex::Regex {
    regex::Regex::new(r"(?:^|[\s(])#([\p{L}\d_][\p{L}\d_-]*)").expect("tag regex")
}

/// The fence a line draws, if it draws one: which character, and how long.
/// Up to three leading spaces are allowed, as in CommonMark.
fn fence_of(line: &str) -> Option<(char, usize)> {
    let indent = line.len() - line.trim_start_matches(' ').len();
    if indent > 3 {
        return None;
    }
    let rest = &line[indent..];
    let marker = rest.chars().next()?;
    if marker != '`' && marker != '~' {
        return None;
    }
    let run = rest.chars().take_while(|&c| c == marker).count();
    (run >= 3).then_some((marker, run))
}

/// Only the same character, at least as long, and nothing after it, closes a
/// fence — a ``` line inside a ```` block is content (review #13).
fn closes(line: &str, marker: char, run: usize) -> bool {
    let Some((closing, length)) = fence_of(line) else {
        return false;
    };
    if closing != marker || length < run {
        return false;
    }
    let indent = line.len() - line.trim_start_matches(' ').len();
    line[indent + length..].trim().is_empty()
}

/// A `#` heading line, whose `#tag`-looking words are part of the title
/// rather than tags (review #13).
fn is_heading(line: &str) -> bool {
    let trimmed = line.trim_start_matches(' ');
    if line.len() - trimmed.len() > 3 {
        return false;
    }
    let hashes = trimmed.chars().take_while(|&c| c == '#').count();
    (1..=6).contains(&hashes)
        && trimmed[hashes..]
            .chars()
            .next()
            .is_none_or(|c| c.is_whitespace())
}

/// Four spaces or a tab. CommonMark needs a blank line in front of an
/// indented code block, and that is what keeps a deep list item out of this
/// (review #13, deliberately the simple version).
fn is_indented(line: &str) -> bool {
    line.starts_with("    ") || line.starts_with('\t')
}

/// The tags of one document, in the order they appear, with duplicates.
fn tags_in(text: &str, pattern: &regex::Regex) -> Vec<String> {
    let mut out = Vec::new();
    let mut fence: Option<(char, usize)> = None;
    let mut previous_blank = true;
    let mut in_indented_code = false;

    for line in text.split('\n') {
        if let Some((marker, run)) = fence {
            if closes(line, marker, run) {
                fence = None;
            }
            previous_blank = false;
            continue;
        }
        if let Some(opened) = fence_of(line) {
            fence = Some(opened);
            previous_blank = false;
            continue;
        }

        let blank = line.trim().is_empty();
        if is_indented(line) && (previous_blank || in_indented_code) {
            in_indented_code = true;
            previous_blank = blank;
            continue;
        }
        if !blank {
            in_indented_code = false;
        }
        previous_blank = blank;

        if is_heading(line) {
            continue;
        }
        for found in pattern.captures_iter(line) {
            let whole = found.get(0).expect("group 0");
            // `](#anchor)` is a link to a heading, not a tag. The `(` is
            // allowed in front of a tag, so this one case is checked by hand
            // — the regex crate has no look-behind.
            if line[whole.start()..].starts_with('(') && line[..whole.start()].ends_with(']') {
                continue;
            }
            let tag = found.get(1).expect("group 1").as_str().to_lowercase();
            // `#12` in "issue #12" is a number, not a tag: a tag needs a letter
            // somewhere (the same rule Obsidian applies).
            if !tag.chars().any(char::is_alphabetic) {
                continue;
            }
            out.push(tag);
        }
    }
    out
}

/// Every tag in the library, most used first (spec §2a). One walk, like the
/// search; no index anywhere.
pub fn tags(root: &Path, extensions: &[String]) -> Result<Vec<TagCount>, String> {
    if !root.is_dir() {
        return Err(format!("not a folder: {}", root.display()));
    }
    let pattern = tag_pattern();

    let per_file: Vec<(String, Vec<String>)> = candidates(root, extensions)
        .par_iter()
        .filter_map(|path| {
            if std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0) > LARGE_FILE {
                return None;
            }
            let bytes = std::fs::read(path).ok()?;
            let text = crate::fs::decode_bytes(&bytes);
            let text = text.replace("\r\n", "\n").replace('\r', "\n");
            let mut found = tags_in(&text, &pattern);
            if found.is_empty() {
                return None;
            }
            found.sort();
            found.dedup();
            Some((path.to_string_lossy().into_owned(), found))
        })
        .collect();

    // Deterministic order in, deterministic order out: rayon does not
    // promise the walk order, and the rail should not shuffle on reload.
    let mut per_file = per_file;
    per_file.sort_by(|a, b| a.0.cmp(&b.0));

    // The count is every file; the list is capped. Saying `3` and listing
    // two files is a lie the filter would then tell (review #13).
    let mut counts: std::collections::HashMap<String, (Vec<String>, usize)> =
        std::collections::HashMap::new();
    for (path, found) in per_file {
        for tag in found {
            let (files, count) = counts.entry(tag).or_default();
            *count += 1;
            if files.len() < MAX_TAG_FILES {
                files.push(path.clone());
            }
        }
    }

    let mut out: Vec<TagCount> = counts
        .into_iter()
        .map(|(tag, (files, count))| TagCount {
            truncated: count > files.len(),
            count,
            tag,
            files,
        })
        .collect();
    // Most used first, then alphabetically, so the list is stable.
    out.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
    out.truncate(MAX_TAGS);
    Ok(out)
}

#[tauri::command]
pub fn collect_tags(root: String, extensions: Vec<String>) -> Result<Vec<TagCount>, String> {
    tags(Path::new(&root), &extensions)
}

/* -------------------------------------------------- backlinks (spec §2a) */

/// A screenful is plenty; nobody reads the four hundredth backlink.
const MAX_BACKLINKS: usize = 200;
/// Context lines are one row in a 232px rail.
const MAX_CONTEXT: usize = 160;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backlink {
    path: String,
    rel: String,
    name: String,
    /// 1-based.
    line: usize,
    text: String,
}

/// `%20` and friends. Not a full URL parser: a link in a note is a path.
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                out.push(byte);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// A destination with a scheme of its own — `https:`, `mailto:`, `tel:` —
/// is not a file in the folder. Two letters at least, so a Windows drive
/// (`c:/notes/a.md`) is still a path (review #12).
fn is_external(destination: &str) -> bool {
    if destination.starts_with("//") {
        return true;
    }
    let scheme: String = destination
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '+' || *c == '.' || *c == '-')
        .collect();
    scheme.len() >= 2
        && scheme.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
        && destination[scheme.len()..].starts_with(':')
}

/// `a/b/../c.md` -> `a/c.md`. A `..` that climbs past the root is kept, so
/// such a path can never equal a file inside it.
fn normalize(path: &str) -> String {
    let mut parts: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if matches!(parts.last(), Some(&last) if last != "..") {
                    parts.pop();
                } else {
                    parts.push("..");
                }
            }
            other => parts.push(other),
        }
    }
    parts.join("/")
}

/// Where a markdown destination points, as a path inside the library,
/// resolved against the file the link is written in. `None` when it is not
/// a local file at all.
///
/// Comparing only the last segment used to be enough to make
/// `archive/note.md` a backlink of `work/note.md`, and to count
/// `https://example.org/note.md` as local (review #12).
fn link_target(destination: &str, from_rel: &str) -> Option<String> {
    let mut text = destination.trim();
    // `](<a file.md>)` is the escape hatch markdown gives for spaces.
    if text.starts_with('<') && text.ends_with('>') {
        text = &text[1..text.len() - 1];
    } else if let Some(title) = text.rfind(|c| c == '"' || c == '\'') {
        // `](path.md "Title")` — the title is not part of the path.
        if let Some(space) = text[..title].rfind(char::is_whitespace) {
            text = &text[..space];
        }
    }
    let text = text.trim();
    if text.is_empty() || text.starts_with('#') || is_external(text) {
        return None;
    }
    let text = text.split('#').next().unwrap_or(text);
    let text = text.split('?').next().unwrap_or(text);
    let decoded = percent_decode(text.trim()).replace('\\', "/");
    if decoded.trim().is_empty() {
        return None;
    }

    // A leading `/` means the library root; anything else is relative to the
    // folder the linking file sits in.
    let joined = if let Some(absolute) = decoded.strip_prefix('/') {
        absolute.to_string()
    } else {
        match from_rel.rsplit_once('/') {
            Some((folder, _)) => format!("{folder}/{decoded}"),
            None => decoded.clone(),
        }
    };
    Some(normalize(&joined).to_lowercase())
}

/// What a wikilink points at: everything before `|` or `#`, lowercased.
fn wiki_target(inside: &str) -> String {
    let text = inside.split('|').next().unwrap_or(inside);
    let text = text.split('#').next().unwrap_or(text);
    text.trim().replace('\\', "/").to_lowercase()
}

fn shorten(line: &str) -> String {
    let trimmed = line.trim();
    if trimmed.chars().count() <= MAX_CONTEXT {
        return trimmed.to_string();
    }
    let cut: String = trimmed.chars().take(MAX_CONTEXT).collect();
    format!("{cut}…")
}

/// Files that link to the document at `doc` (spec §2a). Four spellings
/// count: `[[name]]`, `[[name|alias]]`, `[[name#heading]]` and a markdown
/// link whose destination ends in the file, `%20` and all. Case is ignored,
/// because Windows ignores it.
///
/// The name and the path inside the library are worked out here rather than
/// passed in: the library root and an open document can reach Rust spelled
/// differently — a short `KOTENO~1` name against the long one — and a prefix
/// comparison on the front end then finds nothing at all.
pub fn links_to(root: &Path, extensions: &[String], doc: &Path) -> Result<Vec<Backlink>, String> {
    if !root.is_dir() {
        return Err(format!("not a folder: {}", root.display()));
    }
    let real_root = std::fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let real_doc = std::fs::canonicalize(doc).unwrap_or_else(|_| doc.to_path_buf());
    let file = real_doc
        .file_name()
        .map(|name| name.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if file.is_empty() {
        return Ok(Vec::new());
    }
    // `тз.md` is also linked to as `[[тз]]`, and as `[[plain/тз]]`.
    let stem = match file.rsplit_once('.') {
        Some((head, _)) if !head.is_empty() => head.to_string(),
        _ => file.clone(),
    };
    // Relative to the root, so the two spellings cannot disagree.
    let own = relative(&real_root, &real_doc).to_lowercase();
    let own_stem = match own.rsplit_once('.') {
        Some((head, _)) if !head.is_empty() => head.to_string(),
        _ => own.clone(),
    };

    let wiki = regex::Regex::new(r"\[\[([^\[\]]{1,200})\]\]").expect("wiki regex");
    // Spaces are allowed inside the destination: notes are written by hand,
    // and `](work/notes with spaces.md)` is what people type. Parentheses
    // still end it, so the match cannot run past the link.
    let link = regex::Regex::new(r"\]\(([^()]{1,400})\)").expect("link regex");

    let hits: Vec<Backlink> = candidates(root, extensions)
        .par_iter()
        .filter(|path| {
            // A file linking to itself is not a backlink.
            relative(root, path).to_lowercase() != own
        })
        .filter_map(|path| {
            if std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0) > LARGE_FILE {
                return None;
            }
            let bytes = std::fs::read(path).ok()?;
            let text = crate::fs::decode_bytes(&bytes);
            let text = text.replace("\r\n", "\n").replace('\r', "\n");

            let from_rel = relative(root, path).to_lowercase();
            let mut found: Vec<Backlink> = Vec::new();
            for (index, line) in text.split('\n').enumerate() {
                // A wikilink names a note, wherever it lives; that is what
                // the syntax means, so it stays a comparison by name.
                let wiki_hit = wiki.captures_iter(line).any(|c| {
                    let target = wiki_target(c.get(1).expect("group 1").as_str());
                    target == stem || target == file || target == own_stem || target == own
                });
                // A markdown link is a path, and a path is resolved.
                let link_hit = !wiki_hit
                    && link.captures_iter(line).any(|c| {
                        link_target(c.get(1).expect("group 1").as_str(), &from_rel)
                            .is_some_and(|target| target == own)
                    });
                if !wiki_hit && !link_hit {
                    continue;
                }
                found.push(Backlink {
                    path: path.to_string_lossy().into_owned(),
                    rel: relative(root, path),
                    name: path
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                    line: index + 1,
                    text: shorten(line),
                });
            }
            (!found.is_empty()).then_some(found)
        })
        .flatten()
        .collect();

    let mut hits = hits;
    hits.sort_by(|a, b| {
        crate::tree::natural_cmp(&a.rel, &b.rel).then_with(|| a.line.cmp(&b.line))
    });
    hits.truncate(MAX_BACKLINKS);
    Ok(hits)
}

#[tauri::command]
pub fn backlinks(
    root: String,
    extensions: Vec<String>,
    path: String,
) -> Result<Vec<Backlink>, String> {
    links_to(Path::new(&root), &extensions, Path::new(&path))
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
        let last = found.ranges.len() - 1;
        let mut previous = 0;
        for (index, &[from, to]) in found.ranges.iter().enumerate() {
            assert!(from >= previous, "ranges come in order");
            assert!(to <= MAX_LINE + 1, "and every one is inside the window");
            let text = shown(&found.text, from, to);
            if index == last {
                // The one the window cuts through keeps the part that shows.
                assert!("needle".starts_with(&text), "clipped to {text}");
            } else {
                assert_eq!(text, "needle");
            }
            previous = to;
        }
    }

    /// Review #12: a match that runs past the window keeps its highlight,
    /// clipped to what is shown. Applying the pattern to the cut window
    /// instead would find no `done` inside it and lose the match entirely.
    #[test]
    fn a_match_that_outruns_the_window_is_still_shown() {
        let dir = tempfile::tempdir().unwrap();
        let line = format!("{}TODO {} done", "x".repeat(100), "y".repeat(2000));
        fs::write(dir.path().join("long.md"), &line).unwrap();

        let mut req = request(dir.path(), "TODO.*done");
        req.regex = true;
        let answer = search(&req).unwrap();

        let found = &answer.files[0].matches[0];
        assert_eq!(found.ranges.len(), 1, "one match, clipped — not none");
        let [from, to] = found.ranges[0];
        assert!(to <= MAX_LINE + 1, "the range stops at the window");
        // The visible head of the match is where the match really begins.
        assert!(shown(&found.text, from, to).starts_with("TODO"));
        // And the cut is honest about there being more.
        assert!(found.text.ends_with('…'));
    }

    /// Review #12: the window is not a line, so `^` must not anchor to it.
    #[test]
    fn an_anchor_means_the_start_of_the_line_not_of_the_window() {
        let dir = tempfile::tempdir().unwrap();
        // `done` appears only in the middle, never at a line start.
        let line = format!("{}TODO {} done", "x".repeat(100), "y".repeat(2000));
        fs::write(dir.path().join("long.md"), &line).unwrap();

        let mut req = request(dir.path(), "^done");
        req.regex = true;
        assert!(search(&req).unwrap().files.is_empty());

        // The same pattern does match where the line really starts.
        let mut head = request(dir.path(), "^x+");
        head.regex = true;
        let answer = search(&head).unwrap();
        assert_eq!(answer.files[0].matches[0].ranges, vec![[0, 100]]);
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

    /* ------------------------------------------------- tags (spec §2a) */

    fn md() -> Vec<String> {
        vec![".md".into()]
    }

    fn tag_names(found: &[TagCount]) -> Vec<&str> {
        found.iter().map(|t| t.tag.as_str()).collect()
    }

    #[test]
    fn collects_tags_and_counts_the_files_they_are_in() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "start #writing and #tools\n").unwrap();
        fs::write(dir.path().join("b.md"), "#writing again, and #writing twice\n").unwrap();
        fs::write(dir.path().join("c.md"), "nothing here\n").unwrap();

        let found = tags(dir.path(), &md()).unwrap();
        // Most used first; a tag counts a file once, however often it says it.
        assert_eq!(tag_names(&found), vec!["writing", "tools"]);
        assert_eq!(found[0].count, 2);
        assert_eq!(found[1].count, 1);
        assert!(found[0].files[0].ends_with("a.md"));
        assert!(found[0].files[1].ends_with("b.md"));
    }

    #[test]
    fn a_heading_is_not_a_tag() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("a.md"),
            "# Heading\n## Second\n#realtag here\n",
        )
        .unwrap();
        assert_eq!(tag_names(&tags(dir.path(), &md()).unwrap()), vec!["realtag"]);
    }

    #[test]
    fn a_fenced_block_holds_no_tags() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("a.md"),
            "#outside\n\n```sh\n# comment\necho #inside\n```\n\n#after\n",
        )
        .unwrap();
        let found = tags(dir.path(), &md()).unwrap();
        assert_eq!(tag_names(&found), vec!["after", "outside"]);
    }

    #[test]
    fn an_anchor_in_a_link_is_not_a_tag() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("a.md"),
            "See [here](#the-anchor) and [there](notes.md#other).\nAlso https://x.dev/page#frag\n(#parenthesised) counts though\n",
        )
        .unwrap();
        assert_eq!(
            tag_names(&tags(dir.path(), &md()).unwrap()),
            vec!["parenthesised"]
        );
    }

    #[test]
    fn tags_are_cyrillic_and_case_folded() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "заметка #Черновик и #черновик\n").unwrap();
        fs::write(dir.path().join("b.md"), "#по-русски #с_подчёркиванием\n").unwrap();
        let found = tags(dir.path(), &md()).unwrap();
        assert_eq!(
            tag_names(&found),
            vec!["по-русски", "с_подчёркиванием", "черновик"]
        );
        assert_eq!(found[2].count, 1);
    }

    /// Review #13: a longer fence is not closed by a shorter one, and the
    /// character has to match.
    #[test]
    fn a_fence_is_closed_only_by_its_own_kind() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("a.md"),
            "````md\n```\n#inner\n```\n````\n\n#outside\n",
        )
        .unwrap();
        fs::write(dir.path().join("b.md"), "~~~\n#tilde\n```\n#still\n~~~\n#after\n").unwrap();

        let found = tags(dir.path(), &md()).unwrap();
        assert_eq!(tag_names(&found), vec!["after", "outside"]);
    }

    /// Review #13: `# Heading #tag` is a title, not a tag.
    #[test]
    fn a_tag_in_a_heading_is_part_of_the_title() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("a.md"),
            "# Заголовок #неТег\n### Third #alsoNot\n\n#real here\n",
        )
        .unwrap();
        assert_eq!(tag_names(&tags(dir.path(), &md()).unwrap()), vec!["real"]);
    }

    /// `#12` in "issue #12" is a number; a tag needs a letter somewhere.
    #[test]
    fn a_bare_number_is_not_a_tag() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("a.md"),
            "see issue #12 and #2024_ but #v2 and #2fa and #q3-2026 count\n",
        )
        .unwrap();
        assert_eq!(tag_names(&tags(dir.path(), &md()).unwrap()), vec!["2fa", "q3-2026", "v2"]);
    }

    /// Review #13: an indented code block is code; an indented list is not.
    #[test]
    fn indented_code_holds_no_tags_but_a_nested_list_does() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("a.md"),
            "text\n\n    code line with #indented\n    still code\n\ntext again\n",
        )
        .unwrap();
        fs::write(
            dir.path().join("b.md"),
            "- item\n    - nested with #nested\n",
        )
        .unwrap();

        let found = tags(dir.path(), &md()).unwrap();
        assert_eq!(tag_names(&found), vec!["nested"]);
    }

    /// Review #13: the count is every file, and it says when the list is not.
    #[test]
    fn the_count_is_honest_when_the_file_list_is_cut() {
        let dir = tempfile::tempdir().unwrap();
        for index in 0..3 {
            fs::write(dir.path().join(format!("{index}.md")), "#everywhere\n").unwrap();
        }
        let found = tags(dir.path(), &md()).unwrap();
        assert_eq!(found[0].count, 3);
        assert_eq!(found[0].files.len(), 3);
        assert!(!found[0].truncated);
    }

    /* -------------------------------------------- backlinks (spec §2a) */

    fn linked(dir: &Path, rel: &str) -> Vec<String> {
        links_to(dir, &md(), &dir.join(rel))
            .unwrap()
            .into_iter()
            .map(|b| format!("{}:{}", b.rel, b.line))
            .collect()
    }

    #[test]
    fn finds_all_four_spellings_of_a_link() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("проекты/plain")).unwrap();
        fs::write(dir.path().join("проекты/plain/тз.md"), "# ТЗ\n").unwrap();

        fs::write(dir.path().join("plain.md"), "Прямая: [[тз]].\n").unwrap();
        fs::write(dir.path().join("alias.md"), "С алиасом: [[тз|само ТЗ]].\n").unwrap();
        fs::write(dir.path().join("anchor.md"), "Смотри [[тз#Сохранность]].\n").unwrap();
        fs::write(
            dir.path().join("relative.md"),
            "Ссылка вбок: [ТЗ](проекты/plain/тз.md).\n",
        )
        .unwrap();
        fs::write(dir.path().join("nothing.md"), "Тут про другое.\n").unwrap();

        assert_eq!(
            linked(dir.path(), "проекты/plain/тз.md"),
            vec!["alias.md:1", "anchor.md:1", "plain.md:1", "relative.md:1"]
        );
    }

    #[test]
    fn an_escaped_space_and_a_different_case_still_link() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("work")).unwrap();
        fs::write(dir.path().join("work/notes with spaces.md"), "# Notes\n").unwrap();
        fs::write(
            dir.path().join("a.md"),
            "[one](work/notes%20with%20spaces.md)\n[two](./work/Notes With Spaces.md)\n[[NOTES WITH SPACES]]\n",
        )
        .unwrap();

        let found = linked(dir.path(), "work/notes with spaces.md");
        assert_eq!(found, vec!["a.md:1", "a.md:2", "a.md:3"]);
    }

    #[test]
    fn a_file_is_not_its_own_backlink_and_near_misses_do_not_count() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("тз.md"), "Я это [[тз]] сам.\n").unwrap();
        fs::write(
            dir.path().join("other.md"),
            "[[тз-старое]] и [[тзx]] и [не то](тз.md.bak) и [тоже нет](тз.markdown)\n",
        )
        .unwrap();
        assert!(linked(dir.path(), "тз.md").is_empty());
    }

    #[test]
    fn a_backlink_carries_the_line_it_was_found_on() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("тз.md"), "# ТЗ\n").unwrap();
        fs::write(
            dir.path().join("diary.md"),
            "первая\nвторая\nСсылка вбок: [ТЗ проекта](тз.md).\n",
        )
        .unwrap();
        let found = links_to(dir.path(), &md(), &dir.path().join("тз.md")).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].line, 3);
        assert_eq!(found[0].name, "diary.md");
        assert_eq!(found[0].text, "Ссылка вбок: [ТЗ проекта](тз.md).");
    }

    /// Review #12: a markdown link is a path, so the same file name in
    /// another folder is a different file.
    #[test]
    fn a_markdown_link_has_to_point_at_this_file() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("work")).unwrap();
        fs::create_dir_all(dir.path().join("archive")).unwrap();
        fs::write(dir.path().join("work/note.md"), "# Note\n").unwrap();
        fs::write(dir.path().join("archive/note.md"), "# Old\n").unwrap();

        fs::write(dir.path().join("hit.md"), "[this one](work/note.md)\n").unwrap();
        fs::write(dir.path().join("miss.md"), "[the other](archive/note.md)\n").unwrap();

        assert_eq!(linked(dir.path(), "work/note.md"), vec!["hit.md:1"]);
    }

    /// Review #12: `https://example.org/note.md` is not a file of ours.
    #[test]
    fn a_link_with_a_scheme_is_not_a_backlink() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("note.md"), "# Note\n").unwrap();
        fs::write(
            dir.path().join("web.md"),
            "[a](https://example.org/note.md)\n[b](mailto:note.md)\n[c](//cdn.example.org/note.md)\n",
        )
        .unwrap();
        fs::write(dir.path().join("local.md"), "[d](c:/elsewhere/note.md)\n").unwrap();

        // The three above are elsewhere on the internet; the drive path is a
        // path, but it points outside the library, so it matches nothing.
        assert!(linked(dir.path(), "note.md").is_empty());
    }

    /// Review #12: `../` is resolved against the file the link is written in.
    #[test]
    fn a_relative_link_is_resolved_from_where_it_is_written() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("проекты/plain")).unwrap();
        fs::create_dir_all(dir.path().join("inbox")).unwrap();
        fs::write(dir.path().join("проекты/plain/тз.md"), "# ТЗ\n").unwrap();

        fs::write(
            dir.path().join("inbox/diary.md"),
            "[up and across](../проекты/plain/тз.md)\n",
        )
        .unwrap();
        fs::write(dir.path().join("проекты/обзор.md"), "[down](plain/тз.md)\n").unwrap();
        fs::write(dir.path().join("root.md"), "[from the root](/проекты/plain/тз.md)\n").unwrap();
        // The same spelling, written one folder too high: not this file.
        fs::write(dir.path().join("wrong.md"), "[nope](plain/тз.md)\n").unwrap();

        assert_eq!(
            linked(dir.path(), "проекты/plain/тз.md"),
            vec!["inbox/diary.md:1", "root.md:1", "проекты/обзор.md:1"]
        );
    }

    /// The root and the document can reach us spelled differently; what
    /// matters is where the file sits inside the folder.
    #[test]
    fn the_two_paths_do_not_have_to_be_spelled_alike() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("notes")).unwrap();
        fs::write(dir.path().join("notes/тз.md"), "# ТЗ\n").unwrap();
        fs::write(dir.path().join("a.md"), "[[тз]]\n").unwrap();

        // The same folder, reached through a `.` component.
        let odd = dir.path().join(".").join("notes").join("тз.md");
        let found = links_to(dir.path(), &md(), &odd).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].rel, "a.md");
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
