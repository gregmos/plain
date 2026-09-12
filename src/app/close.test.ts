// Closing a window: the one question about unsaved work, asked once and only
// once, the snapshot that goes to state.json when the window writing it is
// the one closing, and the session changing hands while it does (W13 §4.1,
// §4.2, §4.3, §8.2, M3, M5).

import { beforeEach, describe, expect, it, vi } from "vitest";

/** Which window Rust says writes the session, when it is asked (§4.2). */
const rust = { writer: "main" };
const invoke = vi.fn(async (command: string) => {
  if (command === "data_path") return "C:/data";
  if (command === "session_writer") return rust.writer;
  return null;
});
const writeTextAtomic = vi.fn(async (_path: string, _text: string) => undefined);
const save = vi.fn(async (_id: string) => true);
const destroy = vi.fn(async () => undefined);
const dirty = new Set<string>();

/** The window Tauri gives this webview, and the handlers put on it. */
const win = {
  label: "main",
  closeRequested: null as ((event: { preventDefault: () => void }) => void) | null,
};
let quitRequested: (() => void) | null = null;
/**
 * Rust telling this window it writes the session now. Registered once for the
 * module and kept between tests, because `installWriterRole` only ever puts
 * one listener on (§4.2).
 */
let handedTheSession: (() => void) | null = null;

vi.mock("./env", () => ({ inTauri: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string) => invoke(c) }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => undefined),
  listen: async (name: string, handler: () => void) => {
    if (name === "plain:quit-requested") quitRequested = handler;
    if (name === "plain:session-writer") handedTheSession = handler;
    return () => undefined;
  },
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    get label() {
      return win.label;
    },
    destroy: () => destroy(),
    onCloseRequested: async (handler: (event: { preventDefault: () => void }) => void) => {
      win.closeRequested = handler;
      return () => undefined;
    },
  }),
}));
vi.mock("@tauri-apps/api/path", () => ({
  join: async (...parts: string[]) => parts.join("/"),
  appDataDir: async () => "C:/data",
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: async () => false,
  readTextFile: async () => "",
  readDir: async () => [],
  remove: async () => undefined,
}));
vi.mock("../editor", () => ({
  dropBuffer: vi.fn(),
  flushActiveEditor: vi.fn(),
  isDirty: (id: string) => dirty.has(id),
}));
vi.mock("./drafts", () => ({
  draftsSettled: async () => undefined,
  dropDraft: async () => undefined,
}));
vi.mock("./save", () => ({ save: (id: string) => save(id) }));
vi.mock("./fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fs")>()),
  writeTextAtomic: (path: string, text: string) => writeTextAtomic(path, text),
}));

const { installCloseGuard } = await import("./close");
const { flushSession, toSession, writeSession } = await import("./session");
const { makeDoc, useStore } = await import("./store");
const { installWriterRole, isSessionWriter, setPromotionHandler } = await import("./windows");

const PATH = "C:/notes/a.md";
const ID = "c:/notes/a.md";
/** Where a Save As at the door puts the document (spec §6, §8). */
const SAVED_AS = "C:/notes/saved-as.md";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The X, `Alt+F4`, `Ctrl+Shift+W`: all one way in (W13 §9). */
function closeTheWindow(): void {
  win.closeRequested?.({ preventDefault: () => undefined });
}

function press(label: string): void {
  useStore
    .getState()
    .dialog?.actions.find((action) => action.label === label)
    ?.run();
}

/** What was written to state.json, parsed back. */
function written(): { files: { path: string }[] } | null {
  const last = writeTextAtomic.mock.calls.at(-1) as unknown as [string, string] | undefined;
  return last ? (JSON.parse(last[1]) as { files: { path: string }[] }) : null;
}

beforeEach(() => {
  win.label = "main";
  win.closeRequested = null;
  quitRequested = null;
  rust.writer = "main";
  // The role belongs to a window, so every test that takes it does so under a
  // label of its own and none of them starts as anything but a stranger.
  setPromotionHandler(null);
  dirty.clear();
  invoke.mockClear();
  writeTextAtomic.mockClear();
  destroy.mockClear();
  save.mockReset();
  save.mockImplementation(async (id: string) => {
    dirty.delete(id);
    return true;
  });
  useStore.setState({
    docs: [makeDoc({ id: ID, path: PATH, text: "a" })],
    activeId: ID,
    dialog: null,
    banners: [],
  });
});

describe("the window that writes the session", () => {
  /**
   * The snapshot is taken in `ready` — after the saves and before the
   * documents go — so a Save As at the door belongs in the next session. A
   * snapshot taken when the close began would name the old file (§4.3).
   */
  it("writes the snapshot it took after the saves, and closes", async () => {
    dirty.add(ID);
    save.mockImplementation(async (id: string) => {
      useStore.getState().renameDoc(id, SAVED_AS);
      dirty.delete(id);
      return true;
    });
    installCloseGuard();
    closeTheWindow();
    press("save");
    await flush();

    expect(written()?.files.map((f) => f.path)).toEqual([SAVED_AS]);
    expect(destroy).toHaveBeenCalled();
  });

  it("writes what was open when nothing had to be saved", async () => {
    installCloseGuard();
    closeTheWindow();
    await flush();

    expect(written()?.files.map((f) => f.path)).toEqual([PATH]);
    expect(destroy).toHaveBeenCalled();
  });

  /** state.json is one snapshot of one window, and `main` is that window. */
  it("is `main` alone: another window closing writes nothing", async () => {
    win.label = "w2";
    installCloseGuard();
    closeTheWindow();
    await flush();

    expect(writeTextAtomic).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it("and `writeSession` itself is the no-op there (W13 §4.2)", async () => {
    win.label = "w2";
    await writeSession(toSession());
    expect(writeTextAtomic).not.toHaveBeenCalled();
  });
});

/**
 * Closing the first window used to freeze the session on its snapshot. The
 * role is handed on instead, and a window that takes it writes at once: from
 * that moment state.json is its own (W13 §4.1, N10).
 */
describe("the session changing hands", () => {
  it("is taken by the window Rust tells, which writes what it has", async () => {
    win.label = "w3";
    await installWriterRole();
    expect(isSessionWriter()).toBe(false);

    handedTheSession?.();
    await flush();

    expect(isSessionWriter()).toBe(true);
    expect(written()?.files.map((f) => f.path)).toEqual([PATH]);
  });

  /**
   * A window starting while the writer closes is handed the role before it is
   * listening, so it asks outright rather than waiting for an event that has
   * already been and gone (§4.2).
   */
  it("is taken at startup from Rust's answer, with no event to hear", async () => {
    win.label = "w4";
    rust.writer = "w4";

    await installWriterRole();
    await flush();

    expect(isSessionWriter()).toBe(true);
    expect(written()?.files.map((f) => f.path)).toEqual([PATH]);
  });

  /**
   * Mid-startup the window shows half a session; writing that over a good
   * state.json would lose the rest. Bootstrap's handler holds the write until
   * startup is done (§4.2).
   */
  it("waits, when it is taken while the window is still starting", async () => {
    win.label = "w5";
    let settle: () => void = () => {};
    const startupSettled = new Promise<void>((resolve) => (settle = resolve));
    await installWriterRole();
    // What bootstrap installs before it reads anything.
    setPromotionHandler(() => startupSettled.then(() => flushSession()));

    handedTheSession?.();
    await flush();
    expect(writeTextAtomic).not.toHaveBeenCalled();

    settle();
    await flush();
    expect(written()?.files.map((f) => f.path)).toEqual([PATH]);
  });

  /** The snapshot taken at the door, not the store the dialog is holding up. */
  it("writes what this window is leaving with when it is taken mid-close", async () => {
    win.label = "w6";
    dirty.add(ID);
    await installWriterRole();
    installCloseGuard();
    closeTheWindow();

    handedTheSession?.();
    await flush();

    expect(written()?.files.map((f) => f.path)).toEqual([PATH]);
    expect(useStore.getState().dialog).not.toBeNull();
  });

  /**
   * The writer may go while this window is already past the question, its
   * documents closed and the store empty. What it leaves behind is still the
   * snapshot from `ready` — a Save As at the door and all — and not the empty
   * store an immediate `flushSession` would have written (§4.2, §Д9 #2).
   */
  it("writes the snapshot from `ready` even when the documents have gone", async () => {
    win.label = "w7";
    dirty.add(ID);
    save.mockImplementation(async (id: string) => {
      useStore.getState().renameDoc(id, SAVED_AS);
      dirty.delete(id);
      return true;
    });
    await installWriterRole();
    installCloseGuard();
    closeTheWindow();
    press("save");
    await flush();

    expect(writeTextAtomic).not.toHaveBeenCalled();
    expect(useStore.getState().docs).toHaveLength(0);
    expect(destroy).toHaveBeenCalled();

    handedTheSession?.();
    await flush();

    expect(written()?.files.map((f) => f.path)).toEqual([SAVED_AS]);
  });
});

describe("the question about unsaved work", () => {
  beforeEach(() => {
    dirty.add(ID);
  });

  /** A quit arriving in a window that is already asking must not ask twice. */
  it("is asked once, however many things ask for the window to close", () => {
    installCloseGuard();
    closeTheWindow();
    const asking = useStore.getState().dialog;
    expect(asking).not.toBeNull();

    quitRequested?.();
    closeTheWindow();

    expect(useStore.getState().dialog).toBe(asking);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("can be asked again after `cancel`", async () => {
    installCloseGuard();
    closeTheWindow();
    press("cancel");
    expect(useStore.getState().dialog).toBeNull();

    closeTheWindow();
    expect(useStore.getState().dialog).not.toBeNull();
    press("don't save");
    await flush();
    expect(destroy).toHaveBeenCalled();
  });

  it("can be asked again after `Esc`", () => {
    installCloseGuard();
    closeTheWindow();
    // The dialog's own way out, which is what `Esc` runs (ui/Modal.tsx).
    useStore.getState().dialog?.cancel?.();

    closeTheWindow();
    expect(useStore.getState().dialog).not.toBeNull();
  });

  /**
   * A save that fails leaves its own banner up and stops the close; without
   * letting go, the window could never be closed again (§Д3 #1).
   */
  it("can be asked again after a save that did not go through", async () => {
    save.mockResolvedValue(false);
    installCloseGuard();
    closeTheWindow();
    press("save");
    await flush();

    expect(destroy).not.toHaveBeenCalled();
    closeTheWindow();
    expect(useStore.getState().dialog).not.toBeNull();
  });

  /**
   * The saves took time and the editor stayed usable; what was typed since
   * was never agreed to, so it is asked about again — and cancelling that
   * second question lets go as well.
   */
  it("can be asked again after the second question was cancelled", async () => {
    save.mockImplementation(async () => true);
    installCloseGuard();
    closeTheWindow();
    press("save");
    await flush();

    // Still dirty: the same question, over the text typed while it saved.
    const asking = useStore.getState().dialog;
    expect(asking).not.toBeNull();

    // The window is still leaving, so nothing may start it a second time.
    quitRequested?.();
    closeTheWindow();
    expect(useStore.getState().dialog).toBe(asking);
    expect(destroy).not.toHaveBeenCalled();

    press("cancel");
    expect(useStore.getState().dialog).toBeNull();
    expect(destroy).not.toHaveBeenCalled();

    closeTheWindow();
    expect(useStore.getState().dialog).not.toBeNull();
  });
});

/**
 * A quit that is called off leaves Rust holding the session still for it, and
 * possibly with no window writing at all — the one that was may have closed
 * under the same quit. The window that said no is the one that says so
 * (W13 §4.1, §4.3).
 */
describe("a quit the reader changed their mind about", () => {
  beforeEach(() => {
    dirty.add(ID);
  });

  it("is called off in Rust as well", () => {
    installCloseGuard();
    quitRequested?.();
    press("cancel");

    expect(invoke).toHaveBeenCalledWith("quit_cancelled");
  });

  /**
   * The quit found the question already up and was ignored, but it was still
   * asked for: cancelling the question that is up cancels the quit too.
   */
  it("is called off by the window whose dialog swallowed it", () => {
    installCloseGuard();
    closeTheWindow();
    quitRequested?.();
    press("cancel");

    expect(invoke).toHaveBeenCalledWith("quit_cancelled");
  });

  /** One window closing and thinking better of it is nobody else's business. */
  it("is not what a window closing on its own was doing", () => {
    installCloseGuard();
    closeTheWindow();
    press("cancel");

    expect(invoke).not.toHaveBeenCalledWith("quit_cancelled");
  });
});
