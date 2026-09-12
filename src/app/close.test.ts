// Closing a window: the one question about unsaved work, asked once and only
// once, and the snapshot that goes to state.json when the window that writes
// it is the one closing (W13 §4.1, §4.3, §8.2, M3, M5).

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (command: string) => (command === "data_path" ? "C:/data" : null));
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

vi.mock("./env", () => ({ inTauri: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string) => invoke(c) }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => undefined),
  listen: async (name: string, handler: () => void) => {
    if (name === "plain:quit-requested") quitRequested = handler;
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
const { toSession, writeSession } = await import("./session");
const { makeDoc, useStore } = await import("./store");

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
