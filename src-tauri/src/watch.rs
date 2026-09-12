// One debounced watcher per window, for its library root and for the folders
// of the files it has open outside it (spec §6). Whatever it sees goes to
// that window as a single `fs-change` event; deciding what a change means is
// the front end's job, because only it knows the hash the buffer came from.
//
// One watcher each rather than one covering them all (W13 §6): a window only
// ever hears about its own files, and a window opening a document does not
// make every other window index its library again.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow};

type Running = Debouncer<RecommendedWatcher, RecommendedCache>;

/// Window label -> which request built the watcher running for it, and the
/// watcher itself.
#[derive(Default)]
pub struct Watcher(Mutex<HashMap<String, (u64, Running)>>);

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

/// Whether a request is worth building for: the front end numbers them, and
/// two of them can be in flight at once with no telling which takes the lock
/// first. The number, not the order of arrival, decides (W13 §6.2).
pub fn should_build(existing: Option<u64>, incoming: u64) -> bool {
    existing.is_none_or(|seen| incoming > seen)
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

/// Restarts this window's watcher over the given root and files. Called again
/// whenever its library or its set of open documents changes.
///
/// `async`, and so off the main thread: starting a watcher walks the whole
/// tree to index it, which on a large library is long enough to be seen. Two
/// short locks rather than one long one, for the same reason — `forget` comes
/// from a window being destroyed, on the main thread, and must not wait for
/// somebody else's tree walk (W13 §6.2, M6).
#[tauri::command]
pub async fn watch(
    app: AppHandle,
    window: WebviewWindow,
    serial: u64,
    root: Option<String>,
    files: Vec<String>,
    state: State<'_, Watcher>,
) -> Result<(), String> {
    let label = window.label().to_string();
    {
        let watchers = state.0.lock().map_err(|error| error.to_string())?;
        if !should_build(watchers.get(&label).map(|(seen, _)| *seen), serial) {
            return Ok(());
        }
    }

    let running = build(&app, label.clone(), root, files)?;

    // Whichever watcher is the loser here is taken out under the lock and let
    // go outside it: on macOS dropping an `FsEventWatcher` stops its run loop
    // and joins its thread (notify 8.2.0), and doing that while holding the
    // lock would make `forget` — which comes from a window being destroyed,
    // on the main thread — wait for that thread (W13 §6.2, M6).
    let stopping = {
        let mut watchers = state.0.lock().map_err(|error| error.to_string())?;
        // The window may have gone while the tree was being walked, and a
        // newer request may have finished first; either way this one is the
        // one to stop. Otherwise it takes the old one's place, and is already
        // watching before the old one is let go.
        if app.get_webview_window(&label).is_some()
            && should_build(watchers.get(&label).map(|(seen, _)| *seen), serial)
        {
            watchers
                .insert(label, (serial, running))
                .map(|(_, old)| old)
        } else {
            Some(running)
        }
    };
    drop(stopping);
    Ok(())
}

/// A window that has gone stops being watched, whether it said so or not.
/// Out of the map under the lock, stopped outside it: this is the main thread
/// and the watcher's own thread is joined as it goes (W13 §6.2, M6).
pub fn forget<R: Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    let state = app.state::<Watcher>();
    let stopping = state
        .0
        .lock()
        .ok()
        .and_then(|mut watchers| watchers.remove(label));
    drop(stopping);
}

#[cfg(test)]
mod tests {
    use super::{ignored, should_build, under};
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

    /// A window with no watcher yet gets one; a request that arrives after a
    /// newer one has landed is dropped, not built (W13 §6.2).
    #[test]
    fn only_a_newer_request_replaces_the_watcher() {
        assert!(should_build(None, 1));
        assert!(!should_build(Some(2), 1));
        assert!(should_build(Some(2), 3));
        // The same request twice is the one already running.
        assert!(!should_build(Some(2), 2));
    }
}
