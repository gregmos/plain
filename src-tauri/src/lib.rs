mod assoc;
// `fs`, `search` and `tree` are the three modules the integration test in
// `tests/pack.rs` drives directly (spec §16). Nothing about them changes —
// only who is allowed to say their names.
pub mod fs;
pub mod history;
pub mod search;
pub mod tree;
mod watch;
pub mod windows;

use std::path::{Path, PathBuf};

use tauri::plugin::{Builder as PluginBuilder, TauriPlugin};
use tauri::{Emitter, Manager, Runtime, Url};
use tauri_plugin_fs::FsExt;

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

/// Windows only: on macOS the app is a bundle and a folder next to it is
/// not something a user can rely on (spec §13a).
#[cfg(windows)]
fn beside_exe() -> Option<PathBuf> {
    Some(std::env::current_exe().ok()?.parent()?.join("data"))
}

#[cfg(not(windows))]
fn beside_exe() -> Option<PathBuf> {
    None
}

/// The one folder every file of ours lives in. Rust and the front end have to
/// agree on it, so the front end asks rather than working it out again.
pub fn data_dir<R: Runtime>(app: &tauri::AppHandle<R>) -> PathBuf {
    let app_data = app.path().app_data_dir().unwrap_or_default();
    pick_data_dir(beside_exe().as_deref(), &app_data)
}

/* -------------------------------------------- the macOS application menu */

/// The id our own Quit carries, so the handler can tell it from the
/// predefined items around it.
#[cfg(target_os = "macos")]
const QUIT_ID: &str = "plain-quit";

/// macOS puts an application menu in the bar whether we ask for one or not,
/// and the default it builds owns `⌘Q` through native `terminate:` — which
/// closes the app without the unsaved-changes question §8 promises. So the
/// menu is ours: predefined items where they behave, and our own Quit
/// (review #1).
///
/// `Close Window` is deliberately absent: `⌘W` closes the open *document*,
/// which is the front end's business (review #5).
#[cfg(target_os = "macos")]
fn build_app_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    let quit = MenuItem::with_id(app, QUIT_ID, "Quit Plain", true, Some("CmdOrCtrl+Q"))?;
    let application = Submenu::with_items(
        app,
        "Plain",
        true,
        &[
            &PredefinedMenuItem::about(app, None, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    // WKWebView needs these to route ⌘C/⌘V at all; our own edit menu in the
    // window cannot stand in for them.
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
        ],
    )?;

    Menu::with_items(app, &[&application, &edit, &window])
}

/// WKWebView's UI delegate does not answer JavaScript `window.print()`, so on
/// macOS the call returns quietly and no dialog appears. The native one does
/// show it (review #9).
#[tauri::command]
fn print_page(window: tauri::WebviewWindow) -> Result<(), String> {
    window.print().map_err(|error| error.to_string())
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
/// in a dialog — so the paths can be read once a window asks for them.
fn allow_paths<R: Runtime, M: Manager<R>>(manager: &M, paths: &[String], folders: &[String]) {
    let Some(scope) = manager.try_fs_scope() else {
        return;
    };
    for path in paths {
        let _ = scope.allow_file(path);
    }
    for folder in folders {
        let _ = scope.allow_directory(folder, true);
    }
}

/// Parks arguments on one window and nudges it to come and take them. Which
/// window: the focused one, so a file from outside lands where the user is
/// looking, and in one window rather than in all of them (W13 §3.2, M8).
///
/// A path that arrives before that window has a listener is not lost — the
/// event is only a nudge, and the parcel keeps until the window drains it.
///
/// Bringing the window forward is not done here but by the callers that did
/// it in 0.2.3 — a second launch and a file from Finder. Launch arguments
/// focused nothing then and must not now (M1); `surface` picks the window the
/// same way this does, so it is always the one the parcel went to.
fn hand_over<R: Runtime>(app: &tauri::AppHandle<R>, paths: Vec<String>, folders: Vec<String>) {
    if paths.is_empty() && folders.is_empty() {
        return;
    }
    allow_paths(app, &paths, &folders);
    // No window at all cannot happen: the last one to close ends the app.
    let Some(label) = windows::target_window(app) else {
        return;
    };
    if windows::queue_for(app, &label, paths, folders) {
        // No payload: the event only says "there is something to take".
        let _ = app.emit_to(&label, "open-path", ());
    }
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

/// Brings a window back in front of the user: out of the Dock or the taskbar
/// if it was minimised, and focused. What a second launch and a click on the
/// Dock icon end with — the window the user was last in, of however many
/// (W13 §3.2).
fn surface<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(label) = windows::target_window(app) {
        windows::surface_window(app, &label);
    }
}

/// Windows hands the foreground to whoever received the last input — after a
/// double-click in Explorer that is the second launch, not the instance that
/// is already running, so its `set_focus` is refused and the taskbar button
/// only flashes. The second launch therefore gives the right away before the
/// single-instance plugin passes the path over (spec §13). `ASFW_ANY` is a
/// grant to anyone, and it lasts until the next input: that is exactly the
/// moment `surface` needs, and until that keystroke or click any process may
/// come forward — which in the second between a launch and the window is
/// nothing a user will notice.
#[cfg(windows)]
fn allow_foreground_handover() {
    // `::windows` is the crate; `windows` on its own would be our own module
    // of that name, and an ambiguity rustc refuses to guess at.
    use ::windows::Win32::UI::WindowsAndMessaging::{AllowSetForegroundWindow, ASFW_ANY};
    let _ = unsafe { AllowSetForegroundWindow(ASFW_ANY) };
}

#[cfg(not(windows))]
fn allow_foreground_handover() {}

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
    // Before the builder, because the single-instance plugin sends the path to
    // the first instance while it initialises and the grant has to be in place
    // by then (spec §13).
    allow_foreground_handover();
    tauri::Builder::default()
        // Order matters: single-instance first (spec §13), and persisted-scope
        // reads the fs scope during its own setup, so fs has to come before it.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            surface(app);
            let cwd = Path::new(&cwd);
            hand_over(app, path_args(argv.clone(), cwd), folder_args(argv, cwd));
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_persisted_scope::init())
        .plugin(tauri_plugin_dialog::init())
        // Copying goes through the plugin, not navigator.clipboard: the web API
        // needs transient activation, which a big document outlives (review).
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(navigation_guard())
        .manage(windows::Windows::default())
        .manage(watch::Watcher::default())
        // Which window the user is in decides where a file from outside goes,
        // and a window that has gone must not still be holding files or be
        // watched. Both handlers run on the main thread, so both take the
        // registry for a constant time and no longer (M6).
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Focused(true) => {
                windows::remember_focus(window.app_handle(), window.label());
            }
            tauri::WindowEvent::Destroyed => {
                windows::drop_window(window.app_handle(), window.label());
                watch::forget(window.app_handle(), window.label());
            }
            _ => {}
        })
        .setup(|app| {
            // Idempotent, and only for a real build: a `tauri dev` run would
            // otherwise point every `.md` at target/debug (spec §13).
            #[cfg(not(debug_assertions))]
            assoc::register_quietly();
            let cwd = std::env::current_dir().unwrap_or_default();
            let argv: Vec<String> = std::env::args().collect();
            // `main` is built before `setup` runs, so there is a window to
            // hand the launch arguments to (W13 §1.3).
            hand_over(
                app.handle(),
                path_args(argv.clone(), &cwd),
                folder_args(argv, &cwd),
            );
            // Our own folder is ours to read and write, wherever it is. The
            // capability grants %APPDATA%, so portable mode would otherwise
            // leave the front end able to write drafts through Rust but not
            // to list or delete them through plugin-fs (spec §2a).
            if let Some(scope) = app.handle().try_fs_scope() {
                let _ = scope.allow_directory(data_dir(app.handle()), true);
            }
            // Ours, not the default one: `⌘Q` has to go through the same
            // question every other way of closing does (review #1).
            #[cfg(target_os = "macos")]
            {
                let menu = build_app_menu(app.handle())?;
                menu.set_as_app_menu()?;
                app.handle().on_menu_event(|handle, event| {
                    if event.id() == QUIT_ID {
                        windows::request_quit_all(handle);
                    }
                });
            }
            // Snapshots older than thirty days go at startup (spec §2a); the
            // front end never has to think about it.
            let handle = app.handle().clone();
            std::thread::spawn(move || history::clean(&handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            allow_asset_dir,
            assoc::register_file_association,
            assoc::unregister_file_association,
            assoc::file_association_registered,
            data_path,
            print_page,
            windows::new_window,
            windows::take_opening,
            windows::set_open_docs,
            windows::holding_window,
            windows::show_doc_in,
            windows::request_quit,
            fs::read_file,
            fs::canonical_path,
            fs::write_file_atomic,
            fs::write_text_atomic,
            fs::hash_file,
            fs::trash_path,
            watch::watch,
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
            history::delete_snapshot,
            history::rename_history
        ])
        .build(tauri::generate_context!())
        .expect("error while building Plain")
        .run(|_app, _event| {
            // Anything that asks the app to go without a code — held back and
            // handed to the same scenario as `⌘Q` (review #1): every window
            // gets the question, and the app goes when the last of them has
            // closed itself (W13 §8.2).
            //
            // Only while there is a window to answer: the same event comes
            // when the last window is destroyed, which is how the window's X
            // ends after its own question. Preventing the exit then left the
            // process alive with no window, nobody to receive the event, and
            // no way to get a window back from the Dock or a double-clicked
            // file. `main` closing first is no longer the end of the app, so
            // the question is whether any window is left at all.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::ExitRequested { api, code, .. } = &_event {
                if code.is_none() && !_app.webview_windows().is_empty() {
                    api.prevent_exit();
                    windows::request_quit_all(_app);
                }
            }
            // A click on the Dock icon. AppKit is told not to do its own
            // reopen handling (tao answers with `has_visible_windows`), so a
            // minimised window would stay in the Dock unless we bring it back.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = &_event {
                surface(_app);
            }
            // Finder does not pass a path in argv: it sends the app an Apple
            // Event, which Tauri turns into this (spec §13a). Same parcel the
            // command line uses, same nudge to the front end — and the window
            // it goes to comes forward, out of the Dock if it was minimised.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                surface(_app);
                let files: Vec<PathBuf> = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .collect();
                let name = |path: &PathBuf| path.to_string_lossy().into_owned();
                let of = |want: fn(&PathBuf) -> bool| -> Vec<String> {
                    files.iter().filter(|path| want(path)).map(name).collect()
                };
                hand_over(_app, of(|path| path.is_file()), of(|path| path.is_dir()));
            }
        });
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

    #[cfg(windows)] // C:\-shaped paths
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
