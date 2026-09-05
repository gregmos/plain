// The library tree (spec §6). One recursive read of the folder, sorted the
// way a person expects: folders first, then natural order. No metadata is
// collected — the tree only knows names.

use std::cmp::Ordering;
use std::fs;
use std::path::Path;

use serde::Serialize;

/// Deep enough for any notes folder; a loop of junctions cannot run away.
const MAX_DEPTH: usize = 24;

/// Folders nobody wants in a notes tree (spec §6).
const IGNORED: [&str; 3] = [".git", ".obsidian", "node_modules"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    name: String,
    /// Absolute path, spelled the way this platform spells it.
    path: String,
    /// Path relative to the root, always `/` separated — the row's identity.
    rel: String,
    dir: bool,
    /// The folder refused to be listed, or the walk stopped at MAX_DEPTH.
    /// `children` is then empty because we do not know, not because it is.
    unreadable: bool,
    /// Files carry their two dates so the library screen can sort by them
    /// (spec §2a); folders and anything unreadable carry 0.
    mtime_ms: f64,
    ctime_ms: f64,
    children: Vec<Node>,
}

/// Milliseconds since the epoch, or 0 when the platform will not say.
fn stamp(time: std::io::Result<std::time::SystemTime>) -> f64 {
    time.ok()
        .and_then(|at| at.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|since| since.as_millis() as f64)
        .unwrap_or(0.0)
}

/// Creating something says either "it is already there" — which is not a
/// failure, the caller simply tries the next name — or a real error.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateError {
    kind: &'static str,
    message: String,
}

impl CreateError {
    fn of(path: &str, error: &std::io::Error) -> Self {
        let kind = if error.kind() == std::io::ErrorKind::AlreadyExists {
            "exists"
        } else {
            "io"
        };
        let message = if kind == "exists" {
            format!("{path} already exists")
        } else {
            error.to_string()
        };
        Self { kind, message }
    }
}

fn ignored_dir(name: &str) -> bool {
    name.starts_with('.') || IGNORED.contains(&name)
}

/// `.md` with or without the dot, in any case.
fn wanted(name: &str, extensions: &[String]) -> bool {
    let lower = name.to_lowercase();
    extensions.iter().any(|ext| {
        let ext = ext.trim_start_matches('.').to_lowercase();
        !ext.is_empty() && lower.len() > ext.len() + 1 && lower.ends_with(&format!(".{ext}"))
    })
}

/// One piece of a name: a run of digits or a run of everything else.
#[derive(PartialEq, Eq, PartialOrd, Ord)]
enum Chunk {
    Num(u128),
    Text(String),
}

fn chunks(name: &str) -> Vec<Chunk> {
    let mut out = Vec::new();
    let mut rest = name;
    while !rest.is_empty() {
        let digits = rest.starts_with(|c: char| c.is_ascii_digit());
        let end = rest
            .find(|c: char| c.is_ascii_digit() != digits)
            .unwrap_or(rest.len());
        let (head, tail) = rest.split_at(end);
        out.push(match head.parse::<u128>() {
            Ok(value) if digits => Chunk::Num(value),
            // A number too long for u128 sorts as the text it is.
            _ => Chunk::Text(head.to_lowercase()),
        });
        rest = tail;
    }
    out
}

/// `a2.md` before `a10.md`, case ignored; identical names keep a stable order.
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    chunks(a).cmp(&chunks(b)).then_with(|| a.cmp(b))
}

/// The nodes, plus whether this folder could be read at all. An unreadable
/// folder is shown as itself, never as an empty one (review #20).
fn read_dir(dir: &Path, prefix: &str, extensions: &[String], depth: usize) -> (Vec<Node>, bool) {
    let Ok(entries) = fs::read_dir(dir) else {
        return (Vec::new(), true);
    };

    let mut folders: Vec<Node> = Vec::new();
    let mut files: Vec<Node> = Vec::new();

    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else { continue };
        // Symlinks and junctions are not followed (spec §6).
        if kind.is_symlink() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        let rel = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let path = entry.path();

        if kind.is_dir() {
            if ignored_dir(&name) {
                continue;
            }
            let (children, unreadable) = if depth + 1 < MAX_DEPTH {
                read_dir(&path, &rel, extensions, depth + 1)
            } else {
                // Not unreadable so much as unread; either way the branch is
                // not the truth, and the row says so.
                (Vec::new(), true)
            };
            folders.push(Node {
                name,
                path: path.to_string_lossy().into_owned(),
                rel,
                dir: true,
                unreadable,
                mtime_ms: 0.0,
                ctime_ms: 0.0,
                children,
            });
        } else if kind.is_file() && wanted(&name, extensions) {
            // On Windows the directory scan already carries the times, so
            // this costs nothing extra.
            let (mtime_ms, ctime_ms) = match entry.metadata() {
                Ok(meta) => (stamp(meta.modified()), stamp(meta.created())),
                Err(_) => (0.0, 0.0),
            };
            files.push(Node {
                name,
                path: path.to_string_lossy().into_owned(),
                rel,
                dir: false,
                unreadable: false,
                mtime_ms,
                ctime_ms,
                children: Vec::new(),
            });
        }
    }

    folders.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    files.sort_by(|a, b| natural_cmp(&a.name, &b.name));
    folders.extend(files);
    (folders, false)
}

/// The whole tree in one call. A sub-folder that refuses to be listed comes
/// back marked; a root that refuses is an error, because an empty rail would
/// be a lie about the folder you just opened.
#[tauri::command]
pub fn read_tree(root: String, extensions: Vec<String>) -> Result<Vec<Node>, String> {
    let dir = Path::new(&root);
    if !dir.is_dir() {
        return Err(format!("not a folder: {root}"));
    }
    let (nodes, unreadable) = read_dir(dir, "", &extensions, 0);
    if unreadable {
        return Err(format!("couldn't read {root}"));
    }
    Ok(nodes)
}

/// `new file` (spec §6). `create_new` is the whole point: a name the tree
/// could not see — a `.txt` the settings hide — must not be overwritten with
/// an empty file, so the front end is told and tries the next name (#4).
#[tauri::command]
pub fn create_file(path: String) -> Result<(), CreateError> {
    std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map(|_| ())
        .map_err(|error| CreateError::of(&path, &error))
}

/// `file`, `dir` or `missing` — what a dropped or argument path turned out
/// to be (spec §6).
#[tauri::command]
pub fn path_kind(path: String) -> String {
    let path = Path::new(&path);
    if path.is_dir() {
        "dir".into()
    } else if path.is_file() {
        "file".into()
    } else {
        "missing".into()
    }
}

/// `rename` in the tree: the file keeps its bytes and gets a new name (§6).
#[tauri::command]
pub fn rename_path(from: String, to: String) -> Result<(), String> {
    if Path::new(&to).exists() {
        return Err(format!("{to} already exists"));
    }
    fs::rename(&from, &to).map_err(|error| error.to_string())
}

/// `new folder` in the tree. Same no-clobber rule as `create_file`, and the
/// same answer when the name is taken.
#[tauri::command]
pub fn create_dir(path: String) -> Result<(), CreateError> {
    fs::create_dir(&path).map_err(|error| CreateError::of(&path, &error))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn md() -> Vec<String> {
        vec![".md".into(), ".markdown".into()]
    }

    fn names(nodes: &[Node]) -> Vec<&str> {
        nodes.iter().map(|n| n.name.as_str()).collect()
    }

    /// Review #4: a file the tree never showed must survive `new file`.
    /// The library screen sorts by these, so they have to be real (spec §2a).
    #[test]
    fn files_carry_their_dates() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();

        let tree = read_tree(dir.path().to_string_lossy().into_owned(), md()).unwrap();
        let folder = &tree[0];
        let file = &tree[1];
        assert_eq!(folder.name, "sub");
        assert_eq!(file.name, "a.md");
        assert!(file.mtime_ms > 0.0, "a file knows when it changed");
        assert!(file.ctime_ms > 0.0, "and when it was made");
        // A folder is never a row on that screen, so it carries nothing.
        assert_eq!(folder.mtime_ms, 0.0);
    }

    #[test]
    fn create_file_never_overwrites() {
        let dir = tempfile::tempdir().unwrap();
        let taken = dir.path().join("notes.txt");
        fs::write(&taken, "please keep me").unwrap();

        let error = create_file(taken.to_string_lossy().into_owned()).unwrap_err();
        assert_eq!(error.kind, "exists");
        assert_eq!(fs::read_to_string(&taken).unwrap(), "please keep me");

        let fresh = dir.path().join("notes 2.txt");
        create_file(fresh.to_string_lossy().into_owned()).unwrap();
        assert_eq!(fs::read_to_string(&fresh).unwrap(), "");
    }

    #[test]
    fn create_dir_says_when_the_name_is_taken() {
        let dir = tempfile::tempdir().unwrap();
        let taken = dir.path().join("notes");
        fs::create_dir(&taken).unwrap();
        let error = create_dir(taken.to_string_lossy().into_owned()).unwrap_err();
        assert_eq!(error.kind, "exists");
    }

    #[test]
    fn sorts_naturally() {
        let mut names = vec!["a10.md", "a2.md", "B.md", "a1.md"];
        names.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(names, vec!["a1.md", "a2.md", "a10.md", "B.md"]);
    }

    #[test]
    fn folders_come_first_and_extensions_are_filtered() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir(root.join("zeta")).unwrap();
        fs::write(root.join("zeta").join("inner.md"), "x").unwrap();
        fs::write(root.join("b.md"), "x").unwrap();
        fs::write(root.join("a.markdown"), "x").unwrap();
        fs::write(root.join("notes.txt"), "x").unwrap();
        fs::write(root.join("no-extension"), "x").unwrap();

        let tree = read_tree(root.to_string_lossy().into_owned(), md()).unwrap();
        assert_eq!(names(&tree), vec!["zeta", "a.markdown", "b.md"]);
        assert_eq!(names(&tree[0].children), vec!["inner.md"]);
        assert_eq!(tree[0].children[0].rel, "zeta/inner.md");
    }

    #[test]
    fn skips_the_folders_the_spec_names() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        for folder in [".git", ".obsidian", "node_modules", ".hidden"] {
            fs::create_dir(root.join(folder)).unwrap();
            fs::write(root.join(folder).join("x.md"), "x").unwrap();
        }
        fs::write(root.join("keep.md"), "x").unwrap();

        let tree = read_tree(root.to_string_lossy().into_owned(), md()).unwrap();
        assert_eq!(names(&tree), vec!["keep.md"]);
    }

    #[test]
    fn an_extra_extension_from_settings_is_honoured() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::write(root.join("notes.txt"), "x").unwrap();
        fs::write(root.join("a.md"), "x").unwrap();

        let tree = read_tree(
            root.to_string_lossy().into_owned(),
            vec![".md".into(), "txt".into()],
        )
        .unwrap();
        assert_eq!(names(&tree), vec!["a.md", "notes.txt"]);
    }

    #[test]
    fn rename_refuses_to_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let a = dir.path().join("a.md");
        let b = dir.path().join("b.md");
        fs::write(&a, "one").unwrap();
        fs::write(&b, "two").unwrap();
        assert!(rename_path(
            a.to_string_lossy().into_owned(),
            b.to_string_lossy().into_owned()
        )
        .is_err());
        assert_eq!(fs::read_to_string(&b).unwrap(), "two");
    }
}
