//! The test pack against the Rust side (spec §16).
//!
//! `tests/pack/fixtures/` is committed, so the encoding round trips run on a
//! clean checkout. `tests/pack/generated/` is not; the search and tree tests
//! say so and pass when it is absent, and `node tests/pack/generate.mjs`
//! (`npm run pack:gen`) brings them to life.
//!
//! The structs these functions return keep their fields private, so the test
//! reads them through `serde` — the same shape the front end sees, which is
//! also the shape that matters.

use std::path::{Path, PathBuf};

use plain_lib::fs::{read_info, write_checked, WriteRequest};
use plain_lib::search::{search, SearchRequest};
use plain_lib::tree::read_tree;
use serde_json::Value;

/* ------------------------------------------------------------------ paths */

fn pack() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("tests")
        .join("pack")
}

fn fixtures() -> PathBuf {
    pack().join("fixtures")
}

fn generated() -> PathBuf {
    pack().join("generated")
}

fn json(path: &Path) -> Value {
    let text = std::fs::read_to_string(path)
        .unwrap_or_else(|error| panic!("{} — {error}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|error| panic!("{} — {error}", path.display()))
}

fn str_of(value: &Value, key: &str) -> String {
    value[key]
        .as_str()
        .unwrap_or_else(|| panic!("no string `{key}` in {value}"))
        .to_string()
}

/* --------------------------------------------------------------- helpers */

/// Reads a file the way an open does, writes it straight back with nothing
/// changed, and hands back `(what the read reported, the bytes before, after)`.
fn round_trip(source: &Path) -> (Value, Vec<u8>, Vec<u8>) {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join(source.file_name().unwrap());
    std::fs::copy(source, &target).unwrap();

    let before = std::fs::read(&target).unwrap();
    let info = serde_json::to_value(read_info(&target, None).unwrap()).unwrap();

    write_checked(&WriteRequest {
        path: target.to_string_lossy().into_owned(),
        text: str_of(&info, "text"),
        encoding: str_of(&info, "encoding"),
        bom: info["bom"].as_bool().unwrap(),
        // What a save writes back — `mixed` becomes the dominant style, and
        // that is the one transformation §8 allows.
        eol: str_of(&info, "dominantEol"),
        base_hash: Some(str_of(&info, "hash")),
        allow_missing: false,
    })
    .unwrap();

    let after = std::fs::read(&target).unwrap();
    (info, before, after)
}

fn lines_of(bytes: &[u8], encoding: &str) -> Vec<String> {
    let text = match encoding {
        "utf-16le" => String::from_utf16_lossy(
            &bytes
                .chunks_exact(2)
                .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
                .collect::<Vec<u16>>(),
        ),
        "utf-16be" => String::from_utf16_lossy(
            &bytes
                .chunks_exact(2)
                .map(|pair| u16::from_be_bytes([pair[0], pair[1]]))
                .collect::<Vec<u16>>(),
        ),
        _ => String::from_utf8_lossy(bytes).into_owned(),
    };
    text.replace("\r\n", "\n")
        .replace('\r', "\n")
        .split('\n')
        .map(str::to_string)
        .collect()
}

/* ------------------------------------------------------------- encodings */

/// The heart of §1.3, on every encoding and every line-ending shape the pack
/// knows: open a file, save it with no edits, and the bytes are the bytes.
/// The two exceptions are the two §8 allows, and both are checked as such.
#[test]
fn every_encoding_survives_a_no_op_save() {
    let manifest = json(&fixtures().join("manifest.json"));
    let entries = manifest["encodings"].as_array().expect("no encodings");
    assert!(entries.len() >= 20, "the pack has {} variants", entries.len());

    let mut checked = 0;
    for entry in entries {
        let name = str_of(entry, "name");
        let source = fixtures().join("encodings").join(&name);
        assert!(source.is_file(), "missing fixture {}", source.display());

        let (info, before, after) = round_trip(&source);
        let encoding = str_of(&info, "encoding");
        let eol = str_of(&info, "eol");
        let decode_errors = info["decodeErrors"].as_bool().unwrap();

        // What the pack says the file is, and what the reader made of it.
        let claimed = str_of(entry, "encoding");
        if claimed != "detected" {
            assert_eq!(encoding, claimed, "{name}: encoding");
            assert_eq!(info["bom"].as_bool().unwrap(), entry["bom"].as_bool().unwrap(), "{name}: bom");
            assert_eq!(eol, str_of(entry, "eol"), "{name}: eol");
            assert_eq!(
                str_of(&info, "dominantEol"),
                str_of(entry, "dominantEol"),
                "{name}: dominant eol"
            );
            assert_eq!(
                info["finalNewline"].as_bool().unwrap(),
                entry["finalNewline"].as_bool().unwrap(),
                "{name}: final newline"
            );
        }
        if let Some(expected) = entry.get("decodeErrors").and_then(Value::as_bool) {
            assert_eq!(decode_errors, expected, "{name}: decode errors");
        }

        if eol == "mixed" {
            // Allowed to change, and only in this one way: same text, same
            // lines, one style of separator.
            assert_ne!(before, after, "{name}: mixed endings should be normalized");
            assert_eq!(
                lines_of(&before, &encoding),
                lines_of(&after, &encoding),
                "{name}: normalizing endings moved text"
            );
            let text = String::from_utf8_lossy(&after).into_owned();
            match str_of(&info, "dominantEol").as_str() {
                "crlf" => assert!(!text.contains('\n') || !text.replace("\r\n", "").contains('\n')),
                "lf" => assert!(!text.contains('\r'), "{name}: a CR survived"),
                _ => assert!(!text.contains('\n'), "{name}: an LF survived"),
            }
        } else if decode_errors {
            // Bytes the encoding could not hold became U+FFFD, so a save
            // would make that permanent and the front end has to ask first
            // (§8). Only the file the pack declares broken may land here: a
            // new fixture that quietly decodes badly is a finding.
            assert_eq!(
                entry.get("decodeErrors").and_then(Value::as_bool),
                Some(true),
                "{name} decoded with errors and the manifest does not say so"
            );
        } else {
            assert_eq!(
                before,
                after,
                "{name}: a save with no edits changed {} bytes",
                before.len().abs_diff(after.len())
            );
        }
        checked += 1;
    }
    assert_eq!(checked, entries.len());
}

/// The flag that stands between a broken read and a broken file (§8).
#[test]
fn decode_errors_are_reported_where_they_are() {
    let clean = ["utf8-lf.md", "utf16le-bom-crlf.md", "cp1251-crlf.md", "nul-byte.md"];
    for name in clean {
        let (info, before, after) = round_trip(&fixtures().join("encodings").join(name));
        assert!(
            !info["decodeErrors"].as_bool().unwrap(),
            "{name} decoded cleanly and should say so"
        );
        assert_eq!(before, after, "{name} should come back byte for byte");
    }

    // An unpaired surrogate cannot survive a decode, and saying otherwise
    // would let a save write U+FFFD over the user's bytes.
    let (info, _, _) = round_trip(&fixtures().join("encodings").join("broken-utf16.md"));
    assert!(
        info["decodeErrors"].as_bool().unwrap(),
        "a truncated UTF-16 file has to be flagged"
    );
    assert_eq!(str_of(&info, "encoding"), "utf-16le");

    // A NUL byte is valid UTF-8 and is not an error, however odd it looks.
    let (info, _, _) = round_trip(&fixtures().join("encodings").join("nul-byte.md"));
    assert!(str_of(&info, "text").contains('\0'), "the NUL has to survive");
    assert!(!info["decodeErrors"].as_bool().unwrap());
}

/// A file that changed under us is a conflict, never a silent overwrite (§8).
#[test]
fn a_stale_base_hash_stops_the_write() {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("utf8-crlf.md");
    std::fs::copy(fixtures().join("encodings").join("utf8-crlf.md"), &target).unwrap();

    let info = serde_json::to_value(read_info(&target, None).unwrap()).unwrap();
    std::fs::write(&target, "somebody else got here first\r\n").unwrap();
    let before = std::fs::read(&target).unwrap();

    let error = write_checked(&WriteRequest {
        path: target.to_string_lossy().into_owned(),
        text: str_of(&info, "text"),
        encoding: str_of(&info, "encoding"),
        bom: false,
        eol: "crlf".into(),
        base_hash: Some(str_of(&info, "hash")),
        allow_missing: false,
    })
    .unwrap_err();

    assert!(format!("{error:?}").contains("conflict"), "{error:?}");
    assert_eq!(std::fs::read(&target).unwrap(), before, "the file was written anyway");
    // And nothing was left behind next to it.
    let leftovers: Vec<String> = std::fs::read_dir(dir.path())
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        .filter(|name| name != "utf8-crlf.md")
        .collect();
    assert!(leftovers.is_empty(), "temp files left behind: {leftovers:?}");
}

/* ------------------------------------------------- the generated library */

fn library() -> Option<PathBuf> {
    let root = generated().join("library");
    root.is_dir().then_some(root)
}

fn md() -> Vec<String> {
    vec![".md".into(), ".markdown".into()]
}

fn request(root: &Path, query: &str) -> SearchRequest {
    SearchRequest {
        root: root.to_string_lossy().into_owned(),
        query: query.into(),
        case_sensitive: false,
        regex: false,
        extensions: md(),
    }
}

#[test]
fn the_search_finds_every_needle_the_manifest_planted() {
    let Some(root) = library() else {
        eprintln!("skipped: run `npm run pack:gen` for tests/pack/generated");
        return;
    };
    let manifest = json(&generated().join("manifest.json"));

    let mut needles = 0;
    for entry in manifest["files"].as_array().unwrap() {
        let rel = str_of(entry, "rel");
        let Some(rel) = rel.strip_prefix("library/") else { continue };
        if entry.get("kind").and_then(Value::as_str) == Some("noise") {
            continue;
        }
        for needle in entry["needles"].as_array().into_iter().flatten() {
            let text = str_of(needle, "text");
            let line = needle["line"].as_u64().unwrap();

            let answer = serde_json::to_value(search(&request(&root, &text)).unwrap()).unwrap();
            let files = answer["files"].as_array().unwrap();
            assert_eq!(files.len(), 1, "`{text}` should be in exactly one file");
            assert_eq!(str_of(&files[0], "rel"), rel, "`{text}` is in the wrong file");
            let lines: Vec<u64> = files[0]["matches"]
                .as_array()
                .unwrap()
                .iter()
                .map(|hit| hit["line"].as_u64().unwrap())
                .collect();
            assert!(lines.contains(&line), "`{text}` is on {lines:?}, not on line {line}");
            needles += 1;
        }
    }
    assert!(needles >= 40, "the pack planted only {needles} needles");
}

#[test]
fn the_search_never_looks_inside_the_folders_the_spec_hides() {
    let Some(root) = library() else {
        eprintln!("skipped: run `npm run pack:gen` for tests/pack/generated");
        return;
    };
    // Every noise file carries this word and nothing else does.
    let answer = search(&request(&root, "нойз-иголка")).unwrap();
    let value = serde_json::to_value(&answer).unwrap();
    assert_eq!(
        value["files"].as_array().unwrap().len(),
        0,
        "found something inside .git / .obsidian / node_modules / .hidden: {value}"
    );

    // The same word is really there, so the search above proved something.
    let noise: Vec<PathBuf> = [".git/COMMIT_EDITMSG.md", ".obsidian/hidden.md", ".hidden/secret.md"]
        .iter()
        .map(|rel| root.join(rel))
        .collect();
    for path in &noise {
        let text = std::fs::read_to_string(path).unwrap();
        assert!(text.contains("нойз-иголка"), "{}", path.display());
    }
}

#[test]
fn the_search_skips_the_files_that_are_too_big() {
    let root = generated().join("large");
    if !root.is_dir() {
        eprintln!("skipped: run `npm run pack:gen` for tests/pack/generated");
        return;
    }
    let answer = serde_json::to_value(search(&request(&root, "Большой файл")).unwrap()).unwrap();
    assert_eq!(answer["skippedLarge"].as_u64().unwrap(), 2, "2.5 MB and 10 MB are over the limit");
    let files = answer["files"].as_array().unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(str_of(&files[0], "name"), "1mb.md");
}

#[test]
fn the_tree_shows_the_notes_and_none_of_the_noise() {
    let Some(root) = library() else {
        eprintln!("skipped: run `npm run pack:gen` for tests/pack/generated");
        return;
    };
    let manifest = json(&generated().join("manifest.json"));
    let expected = manifest["libraryNoteCount"].as_u64().unwrap() as usize;

    let tree = serde_json::to_value(read_tree(root.to_string_lossy().into_owned(), md()).unwrap()).unwrap();

    fn walk(nodes: &Value, files: &mut Vec<String>, dirs: &mut Vec<String>) {
        for node in nodes.as_array().unwrap() {
            let rel = node["rel"].as_str().unwrap().to_string();
            if node["dir"].as_bool().unwrap() {
                dirs.push(rel);
                walk(&node["children"], files, dirs);
            } else {
                files.push(rel);
            }
        }
    }

    let mut files = Vec::new();
    let mut dirs = Vec::new();
    walk(&tree, &mut files, &mut dirs);

    assert_eq!(files.len(), expected, "the tree shows {} notes: {files:?}", files.len());
    for hidden in [".git", ".obsidian", "node_modules", ".hidden"] {
        assert!(
            !dirs.iter().any(|rel| rel.split('/').any(|part| part == hidden)),
            "{hidden} is in the tree"
        );
        assert!(!files.iter().any(|rel| rel.split('/').any(|part| part == hidden)));
    }
    for other in ["notes.txt", "image.jpg"] {
        assert!(!files.iter().any(|rel| rel.ends_with(other)), "{other} is in the tree");
    }
    // An empty folder is still a folder, and the rail shows it as one.
    assert!(dirs.iter().any(|rel| rel == "empty-folder"), "the empty folder vanished");
    // Cyrillic, spaces and `&` in names all survive the walk.
    assert!(files.iter().any(|rel| rel == "проекты/plain/тз.md"), "{files:?}");
    assert!(files.iter().any(|rel| rel == "work/specs/api notes.md"));
    assert!(files.iter().any(|rel| rel == "recipes/bread & butter.md"));
    assert!(files.iter().any(|rel| rel == "readme.markdown"));
    assert!(dirs.iter().any(|rel| rel == "проекты/сад на балконе"));
}

/// Every library note goes through a no-op save too: the library is where
/// the CRLF and the Cyrillic paths live, and both are byte-level promises.
#[test]
fn every_library_note_survives_a_no_op_save() {
    if library().is_none() {
        eprintln!("skipped: run `npm run pack:gen` for tests/pack/generated");
        return;
    }
    let manifest = json(&generated().join("manifest.json"));

    let mut checked = 0;
    for entry in manifest["files"].as_array().unwrap() {
        let rel = str_of(entry, "rel");
        if !rel.starts_with("library/")
            || !(rel.ends_with(".md") || rel.ends_with(".markdown"))
            || entry.get("kind").and_then(Value::as_str) == Some("noise")
        {
            continue;
        }
        let (info, before, after) = round_trip(&generated().join(&rel));
        assert_eq!(str_of(&info, "eol"), str_of(entry, "eol"), "{rel}: eol");
        assert_eq!(before, after, "{rel}: a save with no edits changed the bytes");
        checked += 1;
    }
    assert_eq!(checked, manifest["libraryNoteCount"].as_u64().unwrap() as usize);
}

/// A folder deleted from under an open file. §8 lets `Ctrl+S` recreate the
/// *file* when the buffer has edits, and refuses when it does not.
///
/// A refusal has to be a no-op on the disk: the folder must not reappear
/// either. Whether the write is allowed is settled before anything is staged,
/// because staging is what creates the folder.
#[test]
fn a_refused_save_leaves_the_deleted_folder_deleted() {
    let dir = tempfile::tempdir().unwrap();
    let folder = dir.path().join("notes");
    std::fs::create_dir(&folder).unwrap();
    let file = folder.join("a.md");
    std::fs::write(&file, "one\n").unwrap();
    let info = serde_json::to_value(read_info(&file, None).unwrap()).unwrap();

    let write = |allow_missing: bool| WriteRequest {
        path: file.to_string_lossy().into_owned(),
        text: "one\n".into(),
        encoding: "utf-8".into(),
        bom: false,
        eol: "lf".into(),
        base_hash: Some(str_of(&info, "hash")),
        allow_missing,
    };

    std::fs::remove_dir_all(&folder).unwrap();
    let refused = write_checked(&write(false)).unwrap_err();
    assert!(format!("{refused:?}").contains("missing"), "{refused:?}");
    assert!(!file.exists(), "a refused save must not write the file");
    assert!(!folder.exists(), "a refused save must not put the folder back");
    assert_eq!(std::fs::read_dir(dir.path()).unwrap().count(), 0, "nor anything else");

    // With `allow_missing`, which is what a buffer with edits asks for, the
    // file comes back and the folder with it — the `recreated` case of §8.
    write_checked(&write(true)).unwrap();
    assert!(folder.is_dir());
    assert_eq!(std::fs::read(&file).unwrap(), b"one\n");
}
