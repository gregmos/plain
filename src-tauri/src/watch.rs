// One debounced watcher for the library root and for the folders of files
// that are open outside it (spec §6). Whatever it sees goes to the front end
// as a single `fs-change` event; deciding what a change means is the front
// end's job, because only it knows the hash the buffer came from.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
pub struct Watcher(Mutex<Option<Debouncer<RecommendedWatcher, RecommendedCache>>>);

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

/// Restarts the watcher over the given root and files. Called again whenever
/// the library or the set of open documents changes.
#[tauri::command]
pub fn watch(
    app: AppHandle,
    root: Option<String>,
    files: Vec<String>,
    state: State<'_, Watcher>,
) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|error| error.to_string())?;
    // Dropping the old one stops its thread; there is only ever one.
    *slot = None;

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
                let _ = handle.emit("fs-change", Change { paths });
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

    *slot = Some(debouncer);
    Ok(())
}

#[tauri::command]
pub fn unwatch(state: State<'_, Watcher>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|error| error.to_string())?;
    *slot = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{ignored, under};
    use std::path::Path;

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

    #[test]
    fn skips_the_folders_nobody_wants_events_from() {
        assert!(ignored(Path::new(r"C:\notes\.git\index")));
        assert!(ignored(Path::new(r"C:\notes\node_modules\a\b.md")));
        assert!(ignored(Path::new(r"C:\notes\.obsidian\workspace.json")));
        assert!(ignored(Path::new(r"C:\notes\.tmpA1B2")));
        assert!(!ignored(Path::new(r"C:\notes\sub\a.md")));
    }
}
