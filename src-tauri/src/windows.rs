// More than one window, and the little each one has to know about the others.
//
// A window is its own webview with its own store, so almost nothing is
// shared. What is here is only the four things that would otherwise be
// fought over: which window a launch argument belongs to, which window
// already has a file open, the slice of state.json each one owns, and the
// labels themselves.

use std::collections::{BTreeMap, HashMap};
use std::sync::Mutex;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow};

/// What the front end answers by running the ordinary close-everything
/// scenario, dialog and all — in every window (spec §8).
pub const QUIT_REQUESTED: &str = "plain:quit-requested";

/// Told to the window that already holds a file, so it brings that document
/// forward instead of a second window opening it a second time.
const ACTIVATE_DOC: &str = "plain:activate-doc";

/// What was open and where you were in it (spec §8). Rust writes it because
/// every window owns one slice and no window can see the others'.
const SESSION_FILE: &str = "state.json";

/// A new window sits this far down and to the right of the one it came from.
const CASCADE: f64 = 28.0;

/// The first window is the one tauri.conf.json builds, and it is called
/// `main` there. The rest are numbered from it, so a window that comes back
/// from the session gets the label it had last time — which is what lets the
/// window-state plugin give it its old size and place.
fn label_for(index: u32) -> String {
    if index == 0 {
        "main".to_string()
    } else {
        format!("w{}", index + 1)
    }
}

fn index_of(label: &str) -> Option<u32> {
    if label == "main" {
        return Some(0);
    }
    let number: u32 = label.strip_prefix('w')?.parse().ok()?;
    number.checked_sub(1)
}

/// What a window is handed at birth: the paths a launch or a second instance
/// asked it to open, and the slice of the session it comes back from. Drained
/// once, by the window itself, as it starts.
#[derive(Default, Clone, Serialize)]
pub struct Opening {
    pub paths: Vec<String>,
    pub folders: Vec<String>,
    pub session: Option<Value>,
}

/// Which window has a document open, and under which spelling of its path.
#[derive(Serialize)]
pub struct Holder {
    label: String,
    key: String,
}

#[derive(Default)]
pub struct Windows(Mutex<Registry>);

#[derive(Default)]
struct Registry {
    /// The next label to hand out. Never goes back inside one run: the
    /// window-state plugin keeps geometry per label, and a reused label would
    /// drop a new window exactly where the one that just closed had been.
    next: u32,
    opening: HashMap<String, Opening>,
    /// label -> the path keys that window has open. One file is one buffer,
    /// one draft and one save, so it may only live in one window (spec §8).
    docs: HashMap<String, Vec<String>>,
    /// Window index -> its slice of state.json, so the windows are written
    /// out in the order they were made.
    sessions: BTreeMap<u32, Value>,
    /// Where a file from Finder or from a second launch goes. Not whichever
    /// window happens to ask first, and not nowhere when the app is behind
    /// another one and no window is focused at all.
    focused: Option<String>,
}

impl Registry {
    fn next_label(&mut self) -> String {
        // Index 0 is `main`, which tauri.conf.json built before any of this.
        self.next = self.next.max(1);
        let index = self.next;
        self.next += 1;
        label_for(index)
    }

    /// The window a path should go to: the focused one, else the first there
    /// is, so a launch argument is never parked where nobody will look.
    fn target<R: Runtime>(&self, app: &AppHandle<R>) -> Option<String> {
        if let Some(label) = self.focused.as_ref() {
            if app.get_webview_window(label).is_some() {
                return Some(label.clone());
            }
        }
        app.webview_windows().keys().next().cloned()
    }
}

/* --------------------------------------------------------------- session */

/// Every window's slice, in the order the windows were made. Version 2 is
/// this list; version 1 was the single object one window wrote (spec §8).
fn document(registry: &Registry) -> Value {
    json!({
        "version": 2,
        "windows": registry.sessions.values().cloned().collect::<Vec<_>>(),
    })
}

/// Losing the session is not worth a complaint — a fresh start is not a bug.
fn write_session<R: Runtime>(app: &AppHandle<R>, registry: &Registry) {
    let path = crate::data_dir(app).join(SESSION_FILE);
    let _ = crate::fs::write_text_atomic(
        path.to_string_lossy().into_owned(),
        document(registry).to_string(),
    );
}

/// The window says what to keep for it, and the file is written with every
/// other window's slice still in place.
#[tauri::command]
pub fn put_session(
    app: AppHandle,
    window: WebviewWindow,
    session: Value,
    state: State<'_, Windows>,
) -> Result<(), String> {
    let Some(index) = index_of(window.label()) else {
        return Ok(());
    };
    let mut registry = state.0.lock().map_err(|error| error.to_string())?;
    registry.sessions.insert(index, session);
    write_session(&app, &registry);
    Ok(())
}

/// A window that was closed on purpose does not come back next time.
/// Quitting does not come through here: every window is meant to return then.
///
/// The last window is the exception. Closing it is how the app is quit on
/// Windows and how `file → exit` ends everywhere, and quitting comes back
/// where it left off — so the last one out keeps its entry (spec §8).
#[tauri::command]
pub fn forget_session(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, Windows>,
) -> Result<(), String> {
    let Some(index) = index_of(window.label()) else {
        return Ok(());
    };
    let mut registry = state.0.lock().map_err(|error| error.to_string())?;
    // The window asking is still open — it closes once this has answered —
    // so anything above one means there is somebody else to come back to.
    if app.webview_windows().len() > 1 {
        registry.sessions.remove(&index);
    }
    write_session(&app, &registry);
    Ok(())
}

/* --------------------------------------------------------------- windows */

/// Built from the window in tauri.conf.json, so the second window is the same
/// window as the first: same size, same drag and drop, same everything but
/// the label and where it sits.
fn build<R: Runtime>(app: &AppHandle<R>, label: &str) -> tauri::Result<WebviewWindow<R>> {
    let mut config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .unwrap_or_default();
    config.label = label.to_string();
    tauri::WebviewWindowBuilder::from_config(app, &config)?.build()
}

/// Down and to the right of the window it came from — landing exactly on top
/// looks like nothing happened. Only for a window that is genuinely new: one
/// coming back from the session already has a place of its own.
fn cascade<R: Runtime>(from: &WebviewWindow<R>, to: &WebviewWindow<R>) {
    let (Ok(position), Ok(scale)) = (from.outer_position(), from.scale_factor()) else {
        return;
    };
    let step = (CASCADE * scale) as i32;
    let _ = to.set_position(tauri::PhysicalPosition::new(
        position.x + step,
        position.y + step,
    ));
}

/// `file → new window`, and the way the session brings back the windows it
/// had. The new window drains what it was given as it starts.
///
/// `restoring` is the difference between the two: a window coming back from
/// state.json has a place of its own already, and one the user just asked
/// for has to be put somewhere the window it came from is not.
#[tauri::command]
pub fn new_window(
    app: AppHandle,
    window: WebviewWindow,
    session: Option<Value>,
    paths: Vec<String>,
    restoring: bool,
    state: State<'_, Windows>,
) -> Result<String, String> {
    // The lock is held only long enough to claim a label and park what the
    // window is to open: building the window itself must not hold it, and
    // the window drains its parcel from inside `build`.
    let label = {
        let mut registry = state.0.lock().map_err(|error| error.to_string())?;
        let label = registry.next_label();
        registry.opening.insert(
            label.clone(),
            Opening {
                paths,
                folders: Vec::new(),
                session,
            },
        );
        label
    };

    let built = build(&app, &label).map_err(|error| error.to_string())?;
    if !restoring {
        cascade(&window, &built);
    }
    Ok(label)
}

/// Everything the window was given at birth, taken once.
#[tauri::command]
pub fn take_opening(window: WebviewWindow, state: State<'_, Windows>) -> Opening {
    state
        .0
        .lock()
        .map(|mut registry| registry.opening.remove(window.label()).unwrap_or_default())
        .unwrap_or_default()
}

/// Brings a window forward: out of the Dock or the taskbar if it was
/// minimised, and focused.
pub fn surface_window<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[tauri::command]
pub fn focus_window(app: AppHandle, label: String) {
    surface_window(&app, &label);
}

/// Whichever window a path from outside should go to.
pub fn target_window<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    app.state::<Windows>()
        .0
        .lock()
        .ok()
        .and_then(|registry| registry.target(app))
}

/// Parks paths and folders on one window and returns whether there is
/// anything for it to take.
pub fn queue_for<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    paths: Vec<String>,
    folders: Vec<String>,
) -> bool {
    if paths.is_empty() && folders.is_empty() {
        return false;
    }
    let state = app.state::<Windows>();
    let Ok(mut registry) = state.0.lock() else {
        return false;
    };
    let opening = registry.opening.entry(label.to_string()).or_default();
    opening.paths.extend(paths);
    opening.folders.extend(folders);
    true
}

/// Remembers which window took the focus last, so a file from Finder has
/// somewhere to go even when the app itself is in the background.
pub fn remember_focus<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Ok(mut registry) = app.state::<Windows>().0.lock() {
        registry.focused = Some(label.to_string());
    }
}

/// A window that has gone takes its share of the registry with it. Its
/// session slice does not: closing on purpose says so through
/// `forget_session`, and quitting means to keep every window.
pub fn drop_window<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Ok(mut registry) = app.state::<Windows>().0.lock() {
        registry.opening.remove(label);
        registry.docs.remove(label);
        if registry.focused.as_deref() == Some(label) {
            registry.focused = None;
        }
    }
}

/* ----------------------------------------------------- one file, one window */

/// The window says what it has open, by the same path keys the front end
/// compares documents with.
#[tauri::command]
pub fn set_open_docs(
    window: WebviewWindow,
    keys: Vec<String>,
    state: State<'_, Windows>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|error| error.to_string())?;
    registry.docs.insert(window.label().to_string(), keys);
    Ok(())
}

/// Which other window already has one of these files open. Two windows with
/// the same file would be two buffers, two drafts under one name and two
/// saves racing each other, so the answer is a window to bring forward
/// instead of a file to open again (spec §8).
#[tauri::command]
pub fn holding_window(
    app: AppHandle,
    window: WebviewWindow,
    keys: Vec<String>,
    state: State<'_, Windows>,
) -> Result<Vec<Holder>, String> {
    let registry = state.0.lock().map_err(|error| error.to_string())?;
    let mine = window.label();
    let mut held = Vec::new();
    for key in keys {
        for (label, open) in &registry.docs {
            // A window that has gone still answers here until its close
            // event lands; asking Tauri is what makes it a live answer.
            if label == mine || app.get_webview_window(label).is_none() {
                continue;
            }
            if open.iter().any(|open| open == &key) {
                held.push(Holder {
                    label: label.clone(),
                    key,
                });
                break;
            }
        }
    }
    Ok(held)
}

/// Brings that window forward and tells it which document to show.
#[tauri::command]
pub fn show_doc_in(app: AppHandle, label: String, key: String) -> Result<(), String> {
    surface_window(&app, &label);
    app.emit_to(&label, ACTIVATE_DOC, key)
        .map_err(|error| error.to_string())
}

/* ------------------------------------------------------------------ quit */

/// `file → exit`, and on macOS `⌘Q` and the Dock's Quit. Every window runs
/// its own unsaved-changes question; the app goes when the last of them has
/// closed itself (spec §8).
#[tauri::command]
pub fn request_quit(app: AppHandle) {
    let _ = app.emit(QUIT_REQUESTED, ());
}

#[cfg(test)]
mod tests {
    use super::{index_of, label_for, Registry};

    /// The label a window gets is a function of its place in the session, so
    /// the same window comes back under the same name — which is how the
    /// window-state plugin knows where to put it.
    #[test]
    fn labels_and_indexes_are_the_same_thing_twice() {
        assert_eq!(label_for(0), "main");
        assert_eq!(label_for(1), "w2");
        assert_eq!(label_for(9), "w10");
        for index in 0..12u32 {
            assert_eq!(index_of(&label_for(index)), Some(index));
        }
    }

    /// Anything that is not one of ours has no slice of the session, and must
    /// not be given somebody else's.
    #[test]
    fn a_label_we_did_not_make_has_no_index() {
        assert_eq!(index_of("w0"), None);
        assert_eq!(index_of("wobble"), None);
        assert_eq!(index_of("w"), None);
        assert_eq!(index_of(""), None);
    }

    /// A label is handed out once. Reusing one would put a new window exactly
    /// where the window that just closed had been.
    #[test]
    fn labels_are_never_handed_out_twice() {
        let mut registry = Registry::default();
        let handed: Vec<String> = (0..4).map(|_| registry.next_label()).collect();
        assert_eq!(handed, vec!["w2", "w3", "w4", "w5"]);
    }
}
