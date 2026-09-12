// More than one window, from the front end's side (src-tauri/src/windows.rs
// holds the other one; W13 §0.2).
//
// A window is its own webview with its own store and its own buffers, so two
// windows share almost nothing and neither has to know what the other is
// showing. The exceptions are all here: which window a file belongs to, what
// a window was handed as it started, which of them writes the session
// (W13 §4.1), the settings — one file, so one set of values everywhere — and
// the `recent` list, which is what stands in for bringing the windows back
// after a restart (W13 §4.4).

import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./env";
import { canonicalPath } from "./fs";
import { pathKey } from "./paths";
import { flushSession } from "./session";
import { dropPendingSettings, normalizeSettings, SETTINGS_CHANGED } from "./settings";
import { useStore } from "./store";

/** Told to the window that already has the file open (W13 §5.5). */
const ACTIVATE_DOC = "plain:activate-doc";

/** Said to the window that takes over writing state.json (W13 §4.1). */
const SESSION_WRITER = "plain:session-writer";

/** Said by the window a file was just opened or saved in (W13 §4.4). */
const RECENT_OPENED = "plain:recent-opened";

/** What `openDoc` and `renameDoc` keep; the receiver keeps the same (store.ts). */
const RECENT_LIMIT = 20;

/**
 * This window's label. `main` is the one tauri.conf.json builds; the rest are
 * `w2`, `w3`… A browser has no windows to tell apart, so it is always the
 * first one there.
 */
export function label(): string {
  return inTauri ? getCurrentWindow().label : "main";
}

/** The window a run starts with: the only one that reads state.json. */
export function isFirstWindow(): boolean {
  return label() === "main";
}

/* ------------------------------------------------------ the session writer */

/**
 * The window that has been told it writes state.json, by label. `main` has
 * the role from the start of the run and hands it on when it closes, so
 * closing the first window does not freeze the session (W13 §4.1, N10).
 */
let promoted: string | null = null;

/** Whether this window is the one writing state.json (W13 §4.1, M3). */
export function isSessionWriter(): boolean {
  const mine = label();
  return mine === "main" || promoted === mine;
}

/**
 * What to do on taking the role. The snapshot to write depends on what the
 * window is doing at that moment — starting up, running, or already closing —
 * so the phase owns it: bootstrap waits for the end of startup, `leave` writes
 * the snapshot it took at the door rather than the emptied store (W13 §4.2).
 */
let onPromoted: (() => Promise<void>) | null = null;

export function setPromotionHandler(handler: (() => Promise<void>) | null): void {
  onPromoted = handler;
}

function becomeWriter(): void {
  // Already ours: `main` asking Rust at startup is told `main`, and writing
  // the session there would be a write bootstrap never did (M1).
  if (isSessionWriter()) return;
  promoted = label();
  // With nobody to say otherwise, a window writes what it is showing.
  void (onPromoted ?? flushSession)();
}

/** One registration, kept as the promise of it, like the settings one (§7.2). */
let writerListening: Promise<void> | null = null;

/**
 * Rust hands the role on when the window that had it is destroyed, and the
 * new writer writes at once: from that moment state.json is this window's.
 *
 * The event is not enough on its own — a window starting while the writer
 * closes would be handed the role before it was listening — so Rust is also
 * asked outright who the writer is now (W13 §4.2).
 */
export async function installWriterRole(): Promise<void> {
  if (!inTauri) return;
  writerListening ??= listen(SESSION_WRITER, becomeWriter).then(
    () => undefined,
    (error: unknown) => {
      // A registration that failed must not stick: the next start tries again
      // rather than running deaf for the rest of the session.
      writerListening = null;
      console.error("couldn't listen for the session writer role", error);
    },
  );
  await writerListening;
  try {
    if ((await invoke<string>("session_writer")) === label()) becomeWriter();
  } catch {
    /* no answer is the same as "not yours": `main` writes as it always did */
  }
}

/* --------------------------------------------------------- starting up */

/** What this window was handed at birth (windows.rs). Drained once. */
export interface Opening {
  paths: string[];
  folders: string[];
  /** The session a `new window` was seeded with; shaped by `normalizeSession`. */
  seed: unknown | null;
}

const NOTHING: Opening = { paths: [], folders: [], seed: null };

export async function takeOpening(): Promise<Opening> {
  if (!inTauri) return { ...NOTHING };
  try {
    const opening = await invoke<Opening>("take_opening");
    return { paths: opening.paths, folders: opening.folders, seed: opening.seed ?? null };
  } catch {
    return { ...NOTHING };
  }
}

/**
 * `file → new window`. It starts on the same library — a second window on one
 * folder is what this is usually for — with nothing open in it (W13 §1.2).
 */
export async function newWindow(seed: unknown): Promise<void> {
  if (!inTauri) return;
  try {
    await invoke<string>("new_window", { seed });
  } catch (error) {
    useStore.getState().setMessage(`couldn't open a window — ${String(error)}`);
  }
}

/** `file → exit`, `⌘Q`: every window is asked, and the last one out ends it. */
export async function requestQuit(): Promise<void> {
  if (!inTauri) return;
  await invoke("request_quit").catch(() => undefined);
}

/* ------------------------------------------------- one file, one window */

export interface Holder {
  label: string;
  key: string;
}

/**
 * Which of these files another window already has open. One file in two
 * windows would be two buffers, two drafts under the same name and two saves
 * racing each other, so it is never opened twice (W13 §5, M2).
 *
 * A registry that cannot be reached answers "nobody": the rule is worth less
 * than the document the reader asked for.
 */
export async function heldElsewhere(keys: string[]): Promise<Map<string, string>> {
  if (!inTauri || keys.length === 0) return new Map();
  try {
    const held = await invoke<Holder[]>("holding_window", { keys });
    return new Map(held.map((one) => [one.key, one.label]));
  } catch {
    return new Map();
  }
}

/** Brings that window forward with that document showing (W13 §5.5). */
export async function showDocIn(holder: Holder): Promise<void> {
  if (!inTauri) return;
  await invoke("show_doc_in", { label: holder.label, key: holder.key }).catch(() => undefined);
}

/** Canonical key -> the id of the document holding it, for `plain:activate-doc`. */
let byKey = new Map<string, string>();

/**
 * Publications are numbered so they cannot land out of order: canonicalizing
 * a set of paths takes a round trip each, and a slow older list must not
 * overwrite a newer one, here or in Rust (W13 §5.2).
 *
 * From the clock rather than from zero: reloading the page in a window that
 * goes on living (HMR, a dev reload) starts this module again while Rust
 * still holds the higher number it had for that label, and every publication
 * after it would be ignored as stale until the count caught up (§Д6 #1).
 */
let generation = Date.now();

/**
 * Keeps Rust's list of what this window holds up to date. Only the documents
 * with a file — a buffer never written to disk is nobody else's to find — and
 * only when that set of paths changes, not on every keystroke.
 *
 * The keys are canonical, which `doc.id` need not be: a file renamed in the
 * tree is keyed off the new name as it was typed (store.ts `renameDoc`).
 */
export function installDocRegistry(): () => void {
  if (!inTauri) return () => undefined;
  /** The paths as last published; `null` until the first publication. */
  let last: string | null = null;

  const publish = (): void => {
    const open = useStore
      .getState()
      .docs.filter((doc) => doc.path !== null)
      .map((doc) => ({ id: doc.id, path: doc.path as string }));
    const signature = open.map((doc) => doc.path).join("|");
    if (signature === last) return;
    last = signature;
    generation += 1;
    const mine = generation;

    void (async () => {
      const pairs = await Promise.all(
        open.map(
          async (doc) =>
            [pathKey(await canonicalPath(doc.path).catch(() => doc.path)), doc.id] as const,
        ),
      );
      // A newer set of paths overtook this one while it was being spelled
      // out; what it says is already wrong.
      if (mine !== generation) return;
      byKey = new Map(pairs);
      await invoke("set_open_docs", { gen: mine, keys: [...byKey.keys()] }).catch(() => undefined);
    })();
  };

  publish();
  const stop = useStore.subscribe((state, previous) => {
    if (state.docs !== previous.docs) publish();
  });
  return () => {
    stop();
    // Whatever is still being canonicalized belongs to a registry that is
    // gone (a StrictMode remount, HMR); the next mount publishes afresh.
    generation += 1;
  };
}

/**
 * Another window asked us to show a document we hold. It looked us up by the
 * canonical key we published, so that is what it is named by (W13 §5.5).
 */
export function installActivateDoc(): () => void {
  if (!inTauri) return () => undefined;
  const unlisten = listen<string>(ACTIVATE_DOC, (event) => {
    const id = byKey.get(event.payload);
    const store = useStore.getState();
    if (id && store.docs.some((doc) => doc.id === id)) store.activate(id);
  });
  return () => void unlisten.then((off) => off());
}

/* --------------------------------------------------------------- settings */

/**
 * The one registration this window makes, kept as the promise of it: a second
 * call puts no second listener on, and does not come back before the first
 * one is really installed either (W13 §7.2).
 */
let settingsListening: Promise<void> | null = null;
/** Until the file this window read has been applied, anything else waits. */
let settingsLoading = false;
let latestRemote: unknown | null = null;

/**
 * settings.json is one file for the whole app, so a theme changed in one
 * window changes in all of them at once. Without this the other windows keep
 * showing the old value and, worse, write it back over the new one on the way
 * out (W13 §7, M4).
 *
 * Installed at the top of `bootstrap`, before the file is read: a write that
 * lands during that read is newer than what the read comes back with, so it
 * is held and applied after it rather than under it.
 */
export async function installSettingsSync(): Promise<void> {
  if (!inTauri) return;
  // A fresh startup read is beginning, whether or not the listener is ours.
  settingsLoading = true;
  latestRemote = null;
  settingsListening ??= listen<{ from: string; settings: unknown }>(
    SETTINGS_CHANGED,
    (event) => {
      if (event.payload.from === label()) return;
      if (settingsLoading) {
        latestRemote = event.payload.settings;
        return;
      }
      applyRemoteSettings(event.payload.settings);
    },
  ).then(
    () => undefined,
    (error: unknown) => {
      // A registration that failed must not stick: the next start tries
      // again rather than running deaf for the rest of the session.
      settingsListening = null;
      console.error("couldn't listen for settings changes", error);
    },
  );
  // Awaited: the registration has to be done before the read starts, or the
  // event it races is simply not heard.
  await settingsListening;
}

/**
 * Bootstrap has applied the settings it read. Anything that arrived while it
 * was reading was written after the read began, so it goes on top (W13 §7.2).
 */
export function settingsLoaded(): void {
  settingsLoading = false;
  const waiting = latestRemote;
  latestRemote = null;
  if (waiting !== null) applyRemoteSettings(waiting);
}

function applyRemoteSettings(settings: unknown): void {
  // Applied, not saved: the window that changed them has already written the
  // file, and writing it again from here would be a loop.
  useStore.getState().applySettings(normalizeSettings(settings));
  // Our own debounced write was made from a snapshot older than this one;
  // letting it go through would put the old values back (W13 §7.2).
  dropPendingSettings();
}

/* ----------------------------------------------------------- recent files */

/** Up while a remote entry is being put in, so it is not sent straight back. */
let applyingRemote = false;

/**
 * The `recent` list is the one thing that survives a window: files opened in
 * any window belong in the list `main` writes to state.json, because that is
 * what the reader has instead of the windows coming back (W13 §4.4).
 *
 * Watching the head of the list catches every local way into it at once —
 * opening a file, Save As, a rename in the tree — without a word in store.ts,
 * save.ts or library/ops.ts. Membership is the guarantee, not order (N16).
 */
export function installRecentSync(): () => void {
  if (!inTauri) return () => undefined;

  const stop = useStore.subscribe((state, previous) => {
    // zustand runs its subscribers inside `set`, so the flag is still up for
    // the list we have just put in ourselves: no echo, no loop between two
    // windows.
    if (applyingRemote || state.recent === previous.recent) return;
    const head = state.recent[0];
    // `forgetRecent` emptying the list moves the head to nothing; there is no
    // file in that to tell anyone about.
    if (typeof head !== "string" || head === "" || head === previous.recent[0]) return;
    void emit(RECENT_OPENED, { from: label(), path: head }).catch(() => undefined);
  });

  const unlisten = listen<{ from: string; path: string }>(RECENT_OPENED, (event) => {
    const { from, path } = event.payload;
    if (from === label() || typeof path !== "string" || path === "") return;
    applyingRemote = true;
    try {
      const { recent, setRecent } = useStore.getState();
      setRecent([path, ...recent.filter((one) => one !== path)].slice(0, RECENT_LIMIT));
    } finally {
      applyingRemote = false;
    }
  });

  return () => {
    stop();
    void unlisten.then((off) => off());
  };
}
