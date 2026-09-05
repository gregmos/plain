use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{Emitter, Manager, Runtime, State, Url};
use tauri_plugin_fs::FsExt;

/// Paths waiting for the frontend to collect them: launch arguments and
/// whatever a second launch handed over.
#[derive(Default)]
struct PendingPaths(Mutex<Vec<String>>);

/// argv -> absolute paths. A relative argument belongs to the working
/// directory of the process that produced it, which for a second launch is
/// not our own, so the cwd is always passed in.
fn path_args<I: IntoIterator<Item = String>>(argv: I, cwd: &Path) -> Vec<String> {
    argv.into_iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .map(|arg| {
            let path = PathBuf::from(arg);
            let absolute = if path.is_absolute() {
                path
            } else {
                cwd.join(path)
            };
            // Drops the "." components a shell leaves behind.
            absolute
                .components()
                .collect::<PathBuf>()
                .to_string_lossy()
                .into_owned()
        })
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
            let paths = path_args(argv, Path::new(&cwd));
            if !paths.is_empty() {
                queue_paths(app, paths);
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
        .setup(|app| {
            let cwd = std::env::current_dir().unwrap_or_default();
            queue_paths(app.handle(), path_args(std::env::args(), &cwd));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![take_pending_paths, allow_asset_dir])
        .run(tauri::generate_context!())
        .expect("error while running Plain");
}

#[cfg(test)]
mod tests {
    use super::path_args;
    use std::path::Path;

    #[test]
    fn drops_the_exe_and_flags() {
        let argv = vec![
            "plain.exe".to_string(),
            "--flag".to_string(),
            r"C:\notes\a.md".to_string(),
        ];
        assert_eq!(
            path_args(argv, Path::new(r"D:\work")),
            vec![r"C:\notes\a.md".to_string()]
        );
    }

    #[test]
    fn resolves_relatives_against_the_given_cwd() {
        let argv = vec!["plain.exe".to_string(), r".\notes\b.md".to_string()];
        assert_eq!(
            path_args(argv, Path::new(r"D:\work")),
            vec![r"D:\work\notes\b.md".to_string()]
        );
    }
}
