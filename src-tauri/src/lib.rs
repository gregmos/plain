mod assoc;
// `fs`, `search` and `tree` are the three modules the integration test in
// `tests/pack.rs` drives directly (spec §16). Nothing about them changes —
// only who is allowed to say their names.
pub mod fs;
pub mod history;
pub mod search;
pub mod tree;
mod watch;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{Emitter, Manager, Runtime, State, Url};
use tauri_plugin_fs::FsExt;

/// Paths waiting for the frontend to collect them: launch arguments and
/// whatever a second launch handed over.
#[derive(Default)]
struct PendingPaths(Mutex<Vec<String>>);

/// The same, for folders: a folder given as an argument opens as the library
/// (spec §6).
#[derive(Default)]
struct PendingFolders(Mutex<Vec<String>>);

/// argv -> absolute paths. A relative argument belongs to the working
/// directory of the process that produced it, which for a second launch is
/// not our own, so the cwd is always passed in. Only arguments that really
/// are files survive: `tauri dev` passes `--color always`, and dropping
/// anything that starts with `-` would still leave `always` behind.
fn resolved_args<I: IntoIterator<Item = String>>(argv: I, cwd: &Path) -> Vec<PathBuf> {
    argv.into_iter()
        .skip(1)
        .map(|arg| {
            let path = PathBuf::from(arg);
            let absolute = if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            };
            // Drops the "." components a shell leaves behind.
            absolute.components().collect()
        })
        .collect()
}

/* ------------------------------------------------------- where data lives */

/// Portable mode: a `data` folder next to `plain.exe` holds settings, drafts,
/// the session and the history instead of `%APPDATA%\Plain` (spec §2a).
/// Nothing else changes — the folder either exists or it does not.
pub fn pick_data_dir(beside_exe: Option<&Path>, app_data: &Path) -> PathBuf {
    match beside_exe {
        Some(folder) if folder.is_dir() => folder.to_path_buf(),
        _ => app_data.to_path_buf(),
    }
}

fn beside_exe() -> Option<PathBuf> {
    Some(std::env::current_exe().ok()?.parent()?.join("data"))
}

/// The one folder every file of ours lives in. Rust and the front end have to
/// agree on it, so the front end asks rather than working it out again.
pub fn data_dir<R: Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    let app_data = app.path().app_data_dir().unwrap_or_default();
    pick_data_dir(beside_exe().as_deref(), &app_data)
}

#[tauri::command]
fn data_path(app: tauri::AppHandle) -> String {
    data_dir(&app).to_string_lossy().into_owned()
}

fn path_args<I: IntoIterator<Item = String>>(argv: I, cwd: &Path) -> Vec<String> {
    resolved_args(argv, cwd)
        .into_iter()
        .filter(|path| path.is_file())
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

/// A folder argument is a library, not a document (spec §6).
fn folder_args<I: IntoIterator<Item = String>>(argv: I, cwd: &Path) -> Vec<String> {
    resolved_args(argv, cwd)
        .into_iter()
        .filter(|path| path.is_dir())
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

/// Widens the fs scope — the dialog plugin only covers what the user picked
/// in a dialog — and parks the paths until the frontend asks for them.
fn queue_paths<R: Runtime, M: Manager<R>>(manager: &M, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if let Some(scope) = manager.try_fs_scope() {
        for path in &paths {
            let _ = scope.allow_file(path);
        }
    }
    if let Ok(mut queue) = manager.state::<PendingPaths>().0.lock() {
        queue.extend(paths);
    }
}

/// Parks folder arguments the same way, and widens the scope they need.
fn queue_folders<R: Runtime, M: Manager<R>>(manager: &M, folders: Vec<String>) {
    if folders.is_empty() {
        return;
    }
    if let Some(scope) = manager.try_fs_scope() {
        for folder in &folders {
            let _ = scope.allow_directory(folder, true);
        }
    }
    if let Ok(mut queue) = manager.state::<PendingFolders>().0.lock() {
        queue.extend(folders);
    }
}

/// Drained by the frontend at startup and again on every `open-path` signal,
/// so a path that arrives before the listener exists is never lost.
#[tauri::command]
fn take_pending_paths(pending: State<'_, PendingPaths>) -> Vec<String> {
    pending
        .0
        .lock()
        .map(|mut queue| std::mem::take(&mut *queue))
        .unwrap_or_default()
}

#[tauri::command]
fn take_pending_folders(pending: State<'_, PendingFolders>) -> Vec<String> {
    pending
        .0
        .lock()
        .map(|mut queue| std::mem::take(&mut *queue))
        .unwrap_or_default()
}

/// Hands a folder to the asset protocol so its images can be shown, and to
/// the file-system scope so links inside it can be opened (spec §9).
/// Called by the frontend for the folder of the open file, for the library,
/// and for whatever an `outside folder · allow` placeholder points at.
#[tauri::command]
fn allow_asset_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("not a folder: {path}"));
    }
    app.asset_protocol_scope()
        .allow_directory(dir, true)
        .map_err(|error| error.to_string())?;
    if let Some(scope) = app.try_fs_scope() {
        scope
            .allow_directory(dir, true)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

/// The webview never leaves our own origin (spec §14); links open in the
/// system browser instead.
fn navigation_guard<R: Runtime>() -> TauriPlugin<R> {
    PluginBuilder::new("plain-navigation")
        .on_navigation(|_webview, url: &Url| match url.scheme() {
            "tauri" => url.host_str() == Some("localhost"),
            "http" => {
                url.host_str() == Some("tauri.localhost")
                    || (cfg!(dev) && url.host_str() == Some("localhost"))
            }
            _ => false,
        })
        .build()
}

pub fn run() {
    tauri::Builder::default()
        // Order matters: single-instance first (spec §13), and persisted-scope
        // reads the fs scope during its own setup, so fs has to come before it.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            let cwd = Path::new(&cwd);
            let paths = path_args(argv.clone(), cwd);
            let folders = folder_args(argv, cwd);
            if !paths.is_empty() || !folders.is_empty() {
                queue_paths(app, paths);
                queue_folders(app, folders);
                // No payload: the event only says "there is something to take".
                let _ = app.emit("open-path", ());
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(navigation_guard())
        .manage(PendingPaths::default())
        .manage(PendingFolders::default())
        .manage(watch::Watcher::default())
        .setup(|app| {
            // Idempotent, and only for a real build: a `tauri dev` run would
            // otherwise point every `.md` at target/debug (spec §13).
            #[cfg(not(debug_assertions))]
            assoc::register_quietly();
            let cwd = std::env::current_dir().unwrap_or_default();
            let argv: Vec<String> = std::env::args().collect();
            queue_paths(app.handle(), path_args(argv.clone(), &cwd));
            queue_folders(app.handle(), folder_args(argv, &cwd));
            // Our own folder is ours to read and write, wherever it is. The
            // capability grants %APPDATA%, so portable mode would otherwise
            // leave the front end able to write drafts through Rust but not
            // to list or delete them through plugin-fs (spec §2a).
            if let Some(scope) = app.handle().try_fs_scope() {
                let _ = scope.allow_directory(data_dir(app.handle()), true);
            }
            // Snapshots older than thirty days go at startup (spec §2a); the
            // front end never has to think about it.
            let handle = app.handle().clone();
            std::thread::spawn(move || history::clean(&handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_pending_paths,
            take_pending_folders,
            allow_asset_dir,
            assoc::register_file_association,
            assoc::unregister_file_association,
            assoc::file_association_registered,
            data_path,
            fs::read_file,
            fs::canonical_path,
            fs::write_file_atomic,
            fs::write_text_atomic,
            fs::hash_file,
            fs::trash_path,
            watch::watch,
            watch::unwatch,
            tree::read_tree,
            tree::path_kind,
            tree::rename_path,
            tree::create_file,
            tree::create_dir,
            search::search_folder,
            search::collect_tags,
            search::backlinks,
            history::list_snapshots,
            history::snapshot_text,
            history::delete_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running Plain");
}

#[cfg(test)]
mod tests {
    use super::{folder_args, path_args, pick_data_dir};
    use std::path::Path;

    /// §2a: a `data` folder next to the exe takes over from %APPDATA%, and
    /// nothing else does.
    #[test]
    fn a_data_folder_next_to_the_exe_wins() {
        let dir = tempfile::tempdir().unwrap();
        let app_data = dir.path().join("appdata");
        let portable = dir.path().join("beside-exe").join("data");

        // Not there: the ordinary place.
        assert_eq!(pick_data_dir(Some(&portable), &app_data), app_data);
        assert_eq!(pick_data_dir(None, &app_data), app_data);

        // A file called `data` is not a folder and does not count.
        std::fs::create_dir_all(portable.parent().unwrap()).unwrap();
        std::fs::write(&portable, "not a folder").unwrap();
        assert_eq!(pick_data_dir(Some(&portable), &app_data), app_data);

        std::fs::remove_file(&portable).unwrap();
        std::fs::create_dir(&portable).unwrap();
        assert_eq!(pick_data_dir(Some(&portable), &app_data), portable);
    }

    #[test]
    fn without_an_exe_folder_it_is_still_the_ordinary_place() {
        assert_eq!(
            pick_data_dir(None, Path::new(r"C:\Users\me\AppData\Roaming\Plain")),
            Path::new(r"C:\Users\me\AppData\Roaming\Plain")
        );
    }

    /// `tauri dev` hands us `--color always`; only real files may survive.
    #[test]
    fn keeps_only_the_arguments_that_are_files() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.md");
        std::fs::write(&file, "x").unwrap();
        let argv = vec![
            "plain.exe".to_string(),
            "--color".to_string(),
            "always".to_string(),
            file.to_string_lossy().into_owned(),
        ];
        assert_eq!(
            path_args(argv, dir.path()),
            vec![file.to_string_lossy().into_owned()]
        );
    }

    #[test]
    fn resolves_relatives_against_the_given_cwd() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("notes")).unwrap();
        let file = dir.path().join("notes").join("b.md");
        std::fs::write(&file, "x").unwrap();

        let argv = vec!["plain.exe".to_string(), r".\notes\b.md".to_string()];
        assert_eq!(
            path_args(argv, dir.path()),
            vec![file.to_string_lossy().into_owned()]
        );
    }

    /// A folder argument is a library, and never a document (spec §6).
    #[test]
    fn a_folder_argument_goes_to_the_other_queue() {
        let dir = tempfile::tempdir().unwrap();
        let argv = vec![
            "plain.exe".to_string(),
            dir.path().to_string_lossy().into_owned(),
        ];
        assert!(path_args(argv.clone(), dir.path()).is_empty());
        assert_eq!(
            folder_args(argv, dir.path()),
            vec![dir.path().to_string_lossy().into_owned()]
        );
    }
}
