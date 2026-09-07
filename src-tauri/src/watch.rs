// One debounced watcher per window, for its library root and for the folders
// of the files it has open outside it (spec §6). Whatever it sees goes to
// that window as a single `fs-change` event; deciding what a change means is
// the front end's job, because only it knows the hash the buffer came from.
//
// One watcher each, rather than one covering them all: a window only ever
// hears about its own files, and a window opening a document does not make
// every other window's library be indexed again.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow};

type Running = Debouncer<RecommendedWatcher, RecommendedCache>;

/// Window label -> the watcher running for it.
#[derive(Default)]
pub struct Watcher(Mutex<HashMap<String, Running>>);

#[derive(Clone, Serialize)]
struct Change {
    paths: Vec<String>,
}

/// `.git`, `.obsidian`, `node_modules`, dot-folders — and, usefully, the
/// `.tmp…` file our own atomic write leaves for a millisecond.
fn ignored(path: &Path) -> bool {
    path.components().any(|component| {
        let name = component.as_os_str().to_string_lossy();
        name == "node_modules" || (name.starts_with('.') && name != "." && name != "..")
    })
}

/// Component by component, case-folded: `C:\notes-old` is not inside
/// `C:\notes`, however much the two strings look alike.
fn under(folder: &Path, root: &Path) -> bool {
    let mut wanted = root.components();
    let mut have = folder.components();
    loop {
        match (wanted.next(), have.next()) {
            (None, _) => return true,
            (Some(_), None) => return false,
            (Some(a), Some(b)) => {
                if a.as_os_str().to_string_lossy().to_lowercase()
                    != b.as_os_str().to_string_lossy().to_lowercase()
                {
                    return false;
                }
            }
        }
    }
}

/// A watcher over one window's root and files, reporting to that window.
fn build(
    app: &AppHandle,
    label: String,
    root: Option<String>,
    files: Vec<String>,
) -> Result<Running, String> {
    let handle = app.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(150),
        None,
        move |result: DebounceEventResult| {
            let Ok(events) = result else { return };
            let mut paths: Vec<String> = Vec::new();
            for event in events {
                for path in &event.paths {
                    if ignored(path) {
                        continue;
                    }
                    let text = path.to_string_lossy().into_owned();
                    if !paths.contains(&text) {
                        paths.push(text);
                    }
                }
            }
            if !paths.is_empty() {
                // To that window alone: the others have their own watchers
                // and their own libraries, and a change here is not theirs.
                let _ = handle.emit_to(&label, "fs-change", Change { paths });
            }
        },
    )
    .map_err(|error| error.to_string())?;

    if let Some(root) = root.as_deref() {
        let path = Path::new(root);
        if path.is_dir() {
            debouncer
                .watch(path, RecursiveMode::Recursive)
                .map_err(|error| error.to_string())?;
        }
    }

    let mut folders: Vec<PathBuf> = Vec::new();
    for file in &files {
        let Some(folder) = Path::new(file).parent() else {
            continue;
        };
        if !folder.is_dir() {
            continue;
        }
        if root.as_deref().is_some_and(|root| under(folder, Path::new(root))) {
            continue;
        }
        if !folders.iter().any(|seen| seen == folder) {
            folders.push(folder.to_path_buf());
        }
    }
    for folder in folders {
        debouncer
            .watch(&folder, RecursiveMode::NonRecursive)
            .map_err(|error| error.to_string())?;
    }

    Ok(debouncer)
}

/// Restarts this window's watcher over the given root and files. Called
/// again whenever its library or its set of open documents changes.
///
/// `async`, and so off the main thread: starting a watcher walks the whole
/// tree to index it, which on a large library is long enough to be seen. On
/// the main thread that is the window not drawing for as long as it takes.
#[tauri::command]
pub async fn watch(
    app: AppHandle,
    window: WebviewWindow,
    root: Option<String>,
    files: Vec<String>,
    state: State<'_, Watcher>,
) -> Result<(), String> {
    let label = window.label().to_string();
    let running = build(&app, label.clone(), root, files)?;
    let mut watchers = state.0.lock().map_err(|error| error.to_string())?;
    // Dropping the old one stops its thread; there is only ever one per
    // window, and the new one is already watching before it goes.
    watchers.insert(label, running);
    Ok(())
}

#[tauri::command]
pub async fn unwatch(window: WebviewWindow, state: State<'_, Watcher>) -> Result<(), String> {
    let mut watchers = state.0.lock().map_err(|error| error.to_string())?;
    watchers.remove(window.label());
    Ok(())
}

/// A window that has gone stops being watched, whether it said so or not.
pub fn forget<R: Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    if let Ok(mut watchers) = app.state::<Watcher>().0.lock() {
        watchers.remove(label);
    }
}

#[cfg(test)]
mod tests {
    use super::{ignored, under};
    use std::path::Path;

    #[cfg(windows)] // C:\-shaped paths
    #[test]
    fn a_neighbour_folder_is_not_inside_the_library() {
        let root = Path::new(r"C:\notes");
        assert!(under(Path::new(r"C:\notes"), root));
        assert!(under(Path::new(r"C:\Notes\sub"), root));
        assert!(under(Path::new("C:/notes/sub/deep"), root));
        assert!(!under(Path::new(r"C:\notes-old"), root));
        assert!(!under(Path::new(r"C:\notesomething\a"), root));
        assert!(!under(Path::new(r"D:\notes"), root));
    }

    #[cfg(windows)] // C:\-shaped paths
    #[test]
    fn skips_the_folders_nobody_wants_events_from() {
        assert!(ignored(Path::new(r"C:\notes\.git\index")));
        assert!(ignored(Path::new(r"C:\notes\node_modules\a\b.md")));
        assert!(ignored(Path::new(r"C:\notes\.obsidian\workspace.json")));
        assert!(ignored(Path::new(r"C:\notes\.tmpA1B2")));
        assert!(!ignored(Path::new(r"C:\notes\sub\a.md")));
    }
}
