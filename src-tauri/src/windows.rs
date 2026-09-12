// More than one window, and the little each one has to know about the others.
//
// A window is its own webview with its own store, so almost nothing is
// shared. What is here is only what would otherwise be fought over: which
// window a path from outside belongs to, which window already has a file
// open, and the labels themselves. Windows last as long as the run and are
// not brought back after it (W13 §0.1 N1), so nothing here reads or writes
// state.json — that is the front end's. What is decided here is only which
// window does the writing, because only this side sees a window go (W13 §4.1).

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Runtime, State, WebviewWindow};

/// What every window answers by running the ordinary close-everything
/// scenario, dialog and all (W13 §8.2). One name for three ways of asking:
/// `file → exit` anywhere, and on macOS `⌘Q` and the Dock's Quit.
const QUIT_REQUESTED: &str = "plain:quit-requested";

/// Told to the window that already holds a file, so it brings that document
/// forward instead of a second window opening it a second time (W13 §5.5).
const ACTIVATE_DOC: &str = "plain:activate-doc";

/// Told to the window that takes over writing state.json, because the one
/// that was writing it has closed (W13 §4.1).
const SESSION_WRITER: &str = "plain:session-writer";

/// A new window sits this far down and to the right of the one it came from,
/// in logical pixels.
const CASCADE: f64 = 28.0;

/// The first window is the one tauri.conf.json builds, and it is called
/// `main` there. The rest are numbered from it (W13 §1.2).
fn label_for(index: u32) -> String {
    if index == 0 {
        "main".to_string()
    } else {
        format!("w{}", index + 1)
    }
}

/// The inverse, and `None` for anything we did not hand out. `w1` is nobody:
/// it would otherwise answer with `main`'s index and take `main`'s place in
/// every ordering (W13 §1.2).
fn index_of(label: &str) -> Option<u32> {
    if label == "main" {
        return Some(0);
    }
    let number: u32 = label.strip_prefix('w')?.parse().ok()?;
    if number < 2 {
        return None;
    }
    Some(number - 1)
}

/// Where a path from outside goes: the window the user was last in, and
/// failing that the lowest-numbered one open — an order of our own, not
/// whatever the window map happens to hand out first (W13 §3.2).
fn pick_target(focused: Option<&str>, live: &[String]) -> Option<String> {
    if let Some(label) = focused {
        if live.iter().any(|open| open == label) {
            return Some(label.to_string());
        }
    }
    live.iter()
        .filter_map(|label| index_of(label).map(|index| (index, label)))
        .min_by_key(|(index, _)| *index)
        .map(|(_, label)| label.clone())
}

/// Who writes state.json now that `gone` has been destroyed: nobody, unless
/// `gone` was the one writing it, and nobody at all while the app is quitting
/// — what a quit leaves is the snapshot of the window that had the role when
/// it was asked for, not of whichever window happens to close last (W13 §4.1).
fn successor(writer: &str, gone: &str, quitting: bool, live: &[String]) -> Option<String> {
    if quitting || writer != gone {
        return None;
    }
    pick_target(None, live)
}

/// What a window is handed at birth: the paths a launch or a second instance
/// asked it to open, and the library and view the window it came from was
/// showing (W13 §2.2). Drained once, by the window itself, as it starts.
#[derive(Default, Clone, Serialize)]
pub struct Opening {
    pub paths: Vec<String>,
    pub folders: Vec<String>,
    pub seed: Option<Value>,
}

/// Which window has a document open, and under which key.
#[derive(Serialize)]
pub struct Holder {
    label: String,
    key: String,
}

#[derive(Default)]
pub struct Windows(Mutex<Registry>);

struct Registry {
    /// The next index to hand out. Never goes back inside one run: the
    /// window-state plugin keeps geometry per label, and a reused label would
    /// drop a new window exactly where the one that just closed had been.
    next: u32,
    opening: HashMap<String, Opening>,
    /// label -> which publication it is, and the canonical path keys that
    /// window had open then. One file is one buffer, one draft and one save,
    /// so it may only live in one window (W13 §5).
    docs: HashMap<String, (u64, Vec<String>)>,
    /// Which window took the focus last, so a file from Finder has somewhere
    /// to go even when the app itself is in the background.
    focused: Option<String>,
    /// Which window writes state.json (W13 §4.1, M3).
    writer: String,
    /// Set from the moment the windows are asked to quit, so the role stops
    /// moving: see `successor`.
    quitting: bool,
}

impl Default for Registry {
    fn default() -> Self {
        Self {
            next: 0,
            opening: HashMap::new(),
            docs: HashMap::new(),
            focused: None,
            // A run begins with the window tauri.conf.json builds, and it
            // writes the session until it closes (W13 §4.1).
            writer: "main".to_string(),
            quitting: false,
        }
    }
}

impl Registry {
    fn next_label(&mut self) -> String {
        // Index 0 is `main`, which tauri.conf.json built before any of this.
        self.next = self.next.max(1);
        let index = self.next;
        self.next += 1;
        label_for(index)
    }

    /// What a window has open, unless a newer list has already landed: the
    /// front end canonicalises its paths asynchronously, so two publications
    /// can finish out of order, and the older one must not win (W13 §5.2).
    fn remember_docs(&mut self, label: &str, generation: u64, keys: Vec<String>) {
        if self
            .docs
            .get(label)
            .is_none_or(|(seen, _)| generation >= *seen)
        {
            self.docs.insert(label.to_string(), (generation, keys));
        }
    }

    /// A window is gone. If it was the one writing state.json, the role goes
    /// to the lowest-numbered window left, and that window is returned so it
    /// can be told — closing the first window must not freeze the session
    /// (W13 §4.1, N10).
    fn hand_writer_over(&mut self, gone: &str, live: &[String]) -> Option<String> {
        let heir = successor(&self.writer, gone, self.quitting, live);
        if let Some(next) = &heir {
            self.writer = next.clone();
        }
        heir
    }

    /// The quit was called off. Windows that closed before the answer took
    /// the role with them, because nothing is handed over while quitting, so
    /// it is looked for again here (W13 §4.1).
    fn quit_called_off(&mut self, live: &[String]) -> Option<String> {
        self.quitting = false;
        if live.iter().any(|label| label == &self.writer) {
            return None;
        }
        let gone = self.writer.clone();
        self.hand_writer_over(&gone, live)
    }
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
/// looks like nothing happened. This is also what overwrites the place the
/// window-state plugin restored for the label (W13 §0.1 N2). Positions are
/// physical, so the step is scaled; failing to move is not worth a complaint.
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

/// `file → new window`. The new window drains what it was given as it starts.
///
/// `async`, and so off the main thread: building a webview from a command
/// that holds the main thread deadlocks WebView2 (W13 §1.2, M6).
#[tauri::command]
pub async fn new_window(
    app: AppHandle,
    window: WebviewWindow,
    seed: Option<Value>,
    state: State<'_, Windows>,
) -> Result<String, String> {
    // The lock is held only long enough to claim a label and park what the
    // window is to start from: building the window itself must not hold it,
    // and the window drains its parcel from inside `build`.
    let label = {
        let mut registry = state.0.lock().map_err(|error| error.to_string())?;
        let label = registry.next_label();
        registry.opening.insert(
            label.clone(),
            Opening {
                paths: Vec::new(),
                folders: Vec::new(),
                seed,
            },
        );
        label
    };

    let built = build(&app, &label).map_err(|error| error.to_string())?;
    cascade(&window, &built);
    Ok(label)
}

/// Everything the window was given at birth, taken once (W13 §2.2).
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

/// Whichever window a path from outside should go to.
pub fn target_window<R: Runtime>(app: &AppHandle<R>) -> Option<String> {
    let live: Vec<String> = app.webview_windows().keys().cloned().collect();
    let focused = app
        .state::<Windows>()
        .0
        .lock()
        .ok()
        .and_then(|registry| registry.focused.clone());
    pick_target(focused.as_deref(), &live)
}

/// Parks paths and folders on one window and returns whether there is
/// anything for it to take. Added to what is already there, never in place of
/// it: a window still starting has its seed in the same parcel (W13 §3.2).
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

/// Remembers which window took the focus last. Called from the main thread,
/// so the lock it takes is this short and nothing else (M6).
pub fn remember_focus<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Ok(mut registry) = app.state::<Windows>().0.lock() {
        registry.focused = Some(label.to_string());
    }
}

/// A window that has gone takes its share of the registry with it, and hands
/// on the session if it was writing it (W13 §4.1).
pub fn drop_window<R: Runtime>(app: &AppHandle<R>, label: &str) {
    // By `Destroyed` the manager has already forgotten this window, so what
    // it lists is what is left (tauri-2.11.5/src/app.rs:2542).
    let live: Vec<String> = app.webview_windows().keys().cloned().collect();
    let state = app.state::<Windows>();
    let heir = state.0.lock().ok().and_then(|mut registry| {
        registry.opening.remove(label);
        registry.docs.remove(label);
        if registry.focused.as_deref() == Some(label) {
            registry.focused = None;
        }
        registry.hand_writer_over(label, &live)
    });
    // Outside the lock: this runs on the main thread, and telling a window
    // something is not a registry operation (M6).
    if let Some(next) = heir {
        let _ = app.emit_to(&next, SESSION_WRITER, ());
    }
}

/* --------------------------------------------------- one file, one window */

/// The window says what it has open, by the same canonical path keys every
/// window compares documents with (W13 §5.2).
#[tauri::command]
pub fn set_open_docs(
    window: WebviewWindow,
    gen: u64,
    keys: Vec<String>,
    state: State<'_, Windows>,
) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|error| error.to_string())?;
    registry.remember_docs(window.label(), gen, keys);
    Ok(())
}

/// Which other window already has one of these files open. Two windows with
/// the same file would be two buffers, two drafts under one name and two
/// saves racing each other, so the answer is a window to bring forward
/// instead of a file to open again (W13 §5.3).
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
        for (label, (_, open)) in &registry.docs {
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

/* --------------------------------------------------------- the session */

/// Which window writes state.json now. A window asks as it starts: the role
/// may have been handed to it before it was listening for the event, and a
/// promotion nobody heard would leave the session with no one writing it
/// (W13 §4.2).
#[tauri::command]
pub fn session_writer(state: State<'_, Windows>) -> Result<String, String> {
    let registry = state.0.lock().map_err(|error| error.to_string())?;
    Ok(registry.writer.clone())
}

/* ------------------------------------------------------------------ quit */

/// `file → exit`, on every platform (W13 §8.2).
#[tauri::command]
pub fn request_quit(app: AppHandle) {
    request_quit_all(&app);
}

/// Every window runs its own unsaved-changes question; the app goes when the
/// last of them has closed itself (W13 §8.2). Also macOS `⌘Q` and the Dock's
/// Quit, which arrive in `lib.rs` and end up here.
pub fn request_quit_all<R: Runtime>(app: &AppHandle<R>) {
    // Before anyone is asked, and the lock is let go before the asking: from
    // here the session belongs to whichever window was writing it when quit
    // was called for, however many windows close first (W13 §4.1).
    if let Ok(mut registry) = app.state::<Windows>().0.lock() {
        registry.quitting = true;
    }
    let _ = app.emit(QUIT_REQUESTED, ());
}

/// A window answered `cancel` to the question a quit put up, so the app is
/// staying. The window that was writing the session may already have closed
/// under the quit, and nothing was handed on while it lasted (W13 §4.1).
#[tauri::command]
pub fn quit_cancelled(app: AppHandle, state: State<'_, Windows>) -> Result<(), String> {
    let live: Vec<String> = app.webview_windows().keys().cloned().collect();
    let heir = {
        let mut registry = state.0.lock().map_err(|error| error.to_string())?;
        registry.quit_called_off(&live)
    };
    if let Some(next) = heir {
        let _ = app.emit_to(&next, SESSION_WRITER, ());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{index_of, label_for, pick_target, successor, Registry};

    /// The label and the index are the same thing twice, and the index is
    /// what orders the windows when none of them is focused.
    #[test]
    fn labels_and_indexes_are_the_same_thing_twice() {
        assert_eq!(label_for(0), "main");
        assert_eq!(label_for(1), "w2");
        assert_eq!(label_for(9), "w10");
        for index in 0..12u32 {
            assert_eq!(index_of(&label_for(index)), Some(index));
        }
    }

    /// Anything we did not hand out is nobody. `w1` especially: it is not a
    /// label of ours, and answering `Some(0)` would make it `main`.
    #[test]
    fn a_label_we_did_not_make_has_no_index() {
        assert_eq!(index_of("w1"), None);
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

    /// A path from outside goes where the user is looking; failing that, to
    /// the lowest-numbered window, and not to none at all (W13 §3.2).
    #[test]
    fn a_path_goes_to_the_focused_window_or_the_first_one() {
        let live = vec!["w3".to_string(), "main".to_string(), "w2".to_string()];
        assert_eq!(pick_target(Some("w3"), &live), Some("w3".to_string()));
        // Focused but gone, and focused at all, come to the same thing.
        assert_eq!(pick_target(Some("w9"), &live), Some("main".to_string()));
        assert_eq!(pick_target(None, &live), Some("main".to_string()));
        assert_eq!(
            pick_target(None, &["w4".to_string(), "w2".to_string()]),
            Some("w2".to_string())
        );
        assert_eq!(pick_target(Some("main"), &[]), None);
    }

    /// Publications that finish out of order: the older list must not undo
    /// the newer one (W13 §5.2).
    #[test]
    fn an_older_list_of_open_files_is_ignored() {
        let mut registry = Registry::default();
        registry.remember_docs("w2", 2, vec!["b".to_string()]);
        registry.remember_docs("w2", 1, vec!["a".to_string()]);
        assert_eq!(registry.docs.get("w2"), Some(&(2, vec!["b".to_string()])));
        // The same generation again, and a newer one, both land.
        registry.remember_docs("w2", 2, vec!["c".to_string()]);
        assert_eq!(registry.docs.get("w2"), Some(&(2, vec!["c".to_string()])));
        registry.remember_docs("w2", 3, Vec::new());
        assert_eq!(registry.docs.get("w2"), Some(&(3, Vec::new())));
    }

    /// Who writes the session next, in the four cases there are (W13 §4.1).
    #[test]
    fn the_session_changes_hands_only_when_the_writer_goes() {
        let live = vec!["w3".to_string(), "w2".to_string()];
        // The writer closed and the app is staying: the lowest index left.
        let heir = successor("main", "main", false, &live);
        assert_eq!(heir.as_deref(), Some("w2"));
        // Some other window closed: nothing to do with the session.
        assert_eq!(successor("main", "w3", false, &live), None);
        // Quitting: the snapshot is the writer's, not the last one out's.
        assert_eq!(successor("main", "main", true, &live), None);
        // Nobody left to write it, and no app to write it for.
        assert_eq!(successor("main", "main", false, &[]), None);
    }

    /// Closing the first window must not freeze the session: the role goes to
    /// the lowest-numbered window left, which then writes what it has open
    /// (W13 §4.1, N10).
    #[test]
    fn the_session_is_handed_to_the_window_left_with_the_lowest_index() {
        let mut registry = Registry::default();
        let live = vec!["w3".to_string(), "w2".to_string()];
        let heir = registry.hand_writer_over("main", &live);
        assert_eq!(heir.as_deref(), Some("w2"));
        assert_eq!(registry.writer, "w2");
        // Any other window closing is nothing to do with the session.
        assert_eq!(registry.hand_writer_over("w3", &["w2".to_string()]), None);
        assert_eq!(registry.writer, "w2");
    }

    /// A quit writes one snapshot: the writer's. The windows closing under it
    /// must not pass the role down the line and end with the last one — often
    /// an empty window — deciding what the session was (W13 §4.1).
    #[test]
    fn a_quit_does_not_move_the_session_from_window_to_window() {
        let mut registry = Registry::default();
        registry.quitting = true;
        let live = vec!["w2".to_string()];
        assert_eq!(registry.hand_writer_over("main", &live), None);
        assert_eq!(registry.writer, "main");
    }

    /// …and when the quit is called off, the role has to be found again: the
    /// window that had it closed before the answer came (W13 §4.1).
    #[test]
    fn a_quit_called_off_leaves_someone_writing() {
        let mut registry = Registry::default();
        registry.quitting = true;
        let live = vec!["w3".to_string(), "w2".to_string()];
        registry.hand_writer_over("main", &live);

        assert_eq!(registry.quit_called_off(&live).as_deref(), Some("w2"));
        assert_eq!(registry.writer, "w2");
        assert!(!registry.quitting);
        // The writer still being there is the ordinary case: nothing moves,
        // and nobody is told anything.
        assert_eq!(registry.quit_called_off(&live), None);
        assert_eq!(registry.writer, "w2");
    }
}
