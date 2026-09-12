// One file lives in one window (W13 §5, M2). Two windows on one document
// would be two buffers, two drafts under one name and two saves racing each
// other, so a file another window has is not opened here — that window comes
// forward with it instead. The other half of the file is what the windows do
// share: the canonical keys they publish, the `recent` list, and the way one
// window asks another to show a document (§4.4, §5.2, §5.5).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileInfo } from "./fs";

const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();
const readFile = vi.fn<(path: string) => Promise<FileInfo>>();
const writeFileAtomic = vi.fn();
const saveDialog = vi.fn<() => Promise<string | null>>();
/** Every IPC call and every event this window sent, in the order they went. */
const log: string[] = [];
const emit = vi.fn(async (name: string, _payload: unknown) => {
  log.push(`emit:${name}`);
});

/** Every handler this window put on Rust's events, by name. */
type Handler = (event: { payload: unknown }) => void;
const listeners: Record<string, Handler[]> = {};

/** Paths the disk spells differently from the way they were asked for. */
const canonical = new Map<string, string>();
/** Paths whose next canonicalization waits to be let through by the test. */
const parked = new Set<string>();
/** How to let each of those through. */
const release = new Map<string, () => void>();

vi.mock("./env", () => ({ inTauri: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a?: unknown) => invoke(c, a) }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: (name: string, payload: unknown) => emit(name, payload),
  listen: async (name: string, handler: Handler) => {
    (listeners[name] ??= []).push(handler);
    return () => {
      listeners[name] = (listeners[name] ?? []).filter((one) => one !== handler);
    };
  },
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "main" }),
}));
vi.mock("@tauri-apps/api/path", () => ({
  join: async (...parts: string[]) => parts.join("/"),
  appDataDir: async () => "C:/data",
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
  save: () => saveDialog(),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async () => false),
  readDir: vi.fn(async () => []),
  readTextFile: vi.fn(async () => "{}"),
  remove: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));
vi.mock("./fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fs")>()),
  readFile: (path: string) => readFile(path),
  canonicalPath: async (path: string) => {
    if (parked.delete(path)) {
      await new Promise<void>((resolve) => release.set(path, resolve));
    }
    return canonical.get(path) ?? path;
  },
  hashFile: vi.fn(async () => null),
  writeFileAtomic: (request: unknown) => writeFileAtomic(request),
  writeTextAtomic: vi.fn(async () => undefined),
}));

const { newDoc, openPaths, openPathsInBackground } = await import("./commands");
const { saveAs } = await import("./save");
const { DEFAULTS, flushSettings, saveSettings } = await import("./settings");
const { makeDoc, useStore } = await import("./store");
const { installActivateDoc, installDocRegistry, installRecentSync, installSettingsSync } =
  await import("./windows");
const { clearBuffers } = await import("../editor/buffers");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** What Rust would send; every listener on that event hears it. */
function fire(name: string, payload: unknown): void {
  for (const handler of listeners[name] ?? []) handler({ payload });
}

function fileInfo(path: string): FileInfo {
  return {
    path,
    text: "text\n",
    encoding: "utf-8",
    bom: false,
    eol: "lf",
    dominantEol: "lf",
    finalNewline: true,
    hash: "hash",
    mtimeMs: 0,
    size: 5,
    readOnly: false,
    decodeErrors: false,
    hardLinks: 1,
  };
}

/** Rust's answer to `holding_window`: nothing is held anywhere else. */
function heldByNobody(): void {
  invoke.mockImplementation(async (command) => (command === "holding_window" ? [] : undefined));
}

/** …and its answer when another window has that one file. */
function heldBy(label: string, key: string): void {
  invoke.mockImplementation(async (command, args) => {
    if (command !== "holding_window") return undefined;
    const asked = (args as { keys: string[] }).keys;
    return asked.includes(key) ? [{ label, key }] : [];
  });
}

/** The keys of the last list this window published (`set_open_docs`). */
function published(): string[][] {
  return invoke.mock.calls
    .filter((call) => call[0] === "set_open_docs")
    .map((call) => (call[1] as { keys: string[] }).keys);
}

beforeEach(() => {
  invoke.mockReset();
  readFile.mockReset();
  emit.mockClear();
  writeFileAtomic.mockReset();
  saveDialog.mockReset();
  canonical.clear();
  parked.clear();
  release.clear();
  for (const name of Object.keys(listeners)) delete listeners[name];
  log.length = 0;
  // Rust hands back the one spelling the disk uses (spec §8).
  readFile.mockImplementation(async (path) => fileInfo(canonical.get(path) ?? path));
  heldByNobody();
  clearBuffers();
  useStore.setState({
    docs: [],
    activeId: null,
    recent: [],
    banners: [],
    message: "",
    libraryPath: null,
  });
});

/* --------------------------------------------- (а)–(д) opening a file */

describe("opening a file another window has", () => {
  it("reads it, keeps no buffer, and brings that window forward", async () => {
    heldBy("w2", "c:/notes/a.md");

    const opened = await openPaths(["C:/notes/a.md"]);

    expect(opened).toBe(false);
    // Read first: the canonical spelling is what the read comes back with,
    // and only then is ownership a question worth asking (§5.3).
    expect(readFile).toHaveBeenCalledWith("C:/notes/a.md");
    expect(useStore.getState().docs).toHaveLength(0);
    expect(invoke).toHaveBeenCalledWith("show_doc_in", { label: "w2", key: "c:/notes/a.md" });
  });

  /**
   * The focus may only leave when there is nothing of ours to look at.
   * Asking for three files and being thrown into another window over the one
   * of them that had moved would lose the other two.
   */
  it("stays put when it opened something of its own, and says where the rest went", async () => {
    heldBy("w2", "c:/notes/taken.md");

    const opened = await openPaths(["C:/notes/taken.md", "C:/notes/mine.md"]);

    expect(opened).toBe(true);
    expect(useStore.getState().docs.map((d) => d.path)).toEqual(["C:/notes/mine.md"]);
    expect(invoke).not.toHaveBeenCalledWith("show_doc_in", expect.anything());
    expect(useStore.getState().message).toContain("another window");
  });

  it("opens it here when no other window has it", async () => {
    heldByNobody();

    const opened = await openPaths(["C:/notes/a.md"]);

    expect(opened).toBe(true);
    expect(useStore.getState().docs.map((d) => d.path)).toEqual(["C:/notes/a.md"]);
  });

  /**
   * The registry is Rust's, and a window that cannot reach it must still be
   * able to open a file — the rule is worth less than the document.
   */
  it("opens it here when the registry cannot be reached", async () => {
    invoke.mockRejectedValue(new Error("no registry"));

    const opened = await openPaths(["C:/notes/a.md"]);

    expect(opened).toBe(true);
    expect(useStore.getState().docs.map((d) => d.path)).toEqual(["C:/notes/a.md"]);
  });

  /** (г) A short 8.3 name is the same file under another spelling (§5.3). */
  it("asks about the spelling the disk uses, not the one it was given", async () => {
    canonical.set("C:/KOTENO~1/a.md", "C:/Kotenochek/a.md");
    heldBy("w2", "c:/kotenochek/a.md");

    const opened = await openPaths(["C:/KOTENO~1/a.md"]);

    expect(opened).toBe(false);
    expect(invoke).toHaveBeenCalledWith("holding_window", { keys: ["c:/kotenochek/a.md"] });
    expect(invoke).toHaveBeenCalledWith("show_doc_in", {
      label: "w2",
      key: "c:/kotenochek/a.md",
    });
  });

  /** (д) `Ctrl+click` is a note to come back to, not a move (§5.3). */
  it("does not move the focus for a link opened in the background", async () => {
    heldBy("w2", "c:/notes/a.md");

    const opened = await openPathsInBackground(["C:/notes/a.md"]);

    expect(opened).toBe(false);
    expect(invoke).not.toHaveBeenCalledWith("show_doc_in", expect.anything());
    expect(useStore.getState().message).toContain("another window");
  });
});

/* ------------------------------------------------------ (е) the registry */

describe("the list of what this window holds", () => {
  it("is published under the canonical keys, and only when the paths change", async () => {
    canonical.set("C:/KOTENO~1/a.md", "C:/Kotenochek/a.md");
    const stop = installDocRegistry();
    useStore
      .getState()
      .openDoc(makeDoc({ id: "c:/koteno~1/a.md", path: "C:/KOTENO~1/a.md", text: "a" }));
    await flush();

    expect(published().at(-1)).toEqual(["c:/kotenochek/a.md"]);
    const sent = published().length;

    // Typing is not a change of what is open.
    useStore.getState().updateDoc("c:/koteno~1/a.md", { text: "more" });
    await flush();
    expect(published()).toHaveLength(sent);
    stop();
  });

  /**
   * `renameDoc` keys the document off the name as it was typed, which need
   * not be the name the disk uses; the registry is canonical either way
   * (§5.2), and that is the key `plain:activate-doc` comes back under (§5.5).
   */
  it("stays canonical after a rename onto a name the disk spells differently", async () => {
    canonical.set("C:/notes/b~1.md", "C:/notes/beta.md");
    const stop = installDocRegistry();
    installActivateDoc();
    useStore.getState().openDoc(makeDoc({ id: "c:/notes/a.md", path: "C:/notes/a.md", text: "a" }));
    await flush();

    useStore.getState().renameDoc("c:/notes/a.md", "C:/notes/b~1.md");
    await flush();

    expect(published().at(-1)).toEqual(["c:/notes/beta.md"]);
    // The id is the name as typed; the key is the disk's.
    useStore.setState({ activeId: null });
    fire("plain:activate-doc", "c:/notes/beta.md");
    expect(useStore.getState().activeId).toBe("c:/notes/b~1.md");
    stop();
  });

  it("keeps the newest list when two publications land out of order", async () => {
    canonical.set("C:/notes/b~1.md", "C:/notes/beta.md");
    // The first publication is slow to spell its file out; the one that
    // overtakes it names a different file, so the two cannot be confused.
    parked.add("C:/notes/a.md");
    const stop = installDocRegistry();
    installActivateDoc();
    useStore.getState().openDoc(makeDoc({ id: "c:/notes/a.md", path: "C:/notes/a.md", text: "a" }));
    await flush();

    const renamed = useStore.getState().renameDoc("c:/notes/a.md", "C:/notes/b~1.md");
    await flush();
    expect(published().at(-1)).toEqual(["c:/notes/beta.md"]);

    // The older list arrives late and is thrown away rather than published.
    release.get("C:/notes/a.md")?.();
    await flush();
    expect(published().at(-1)).toEqual(["c:/notes/beta.md"]);

    // The key table went with it, so the window answers for the name it
    // published and not for the one it never did (§5.2, §5.5).
    useStore.setState({ activeId: null });
    fire("plain:activate-doc", "c:/notes/a.md");
    expect(useStore.getState().activeId).toBeNull();
    fire("plain:activate-doc", "c:/notes/beta.md");
    expect(useStore.getState().activeId).toBe(renamed);
    stop();
  });

  it("throws away a publication the hook did not live long enough to make", async () => {
    parked.add("C:/notes/a.md");
    const stop = installDocRegistry();
    useStore.getState().openDoc(makeDoc({ id: "c:/notes/a.md", path: "C:/notes/a.md", text: "a" }));
    await flush();
    const before = published().length;

    stop();
    release.get("C:/notes/a.md")?.();
    await flush();

    expect(published()).toHaveLength(before);
  });
});

/* ------------------------------------------------ (ж) a nameless buffer */

describe("a nameless buffer", () => {
  it("is named after the window that made it, so two windows cannot collide", () => {
    heldByNobody();
    newDoc();
    expect(useStore.getState().docs[0]?.id).toMatch(/^untitled-main-/);
  });
});

/* ---------------------------------------------------------- (з) recent */

describe("the recent list the windows keep between them", () => {
  it("says what was opened here, and takes what another window opened", () => {
    const stop = installRecentSync();
    useStore.getState().openDoc(makeDoc({ id: "c:/notes/a.md", path: "C:/notes/a.md", text: "a" }));

    expect(emit).toHaveBeenCalledWith("plain:recent-opened", {
      from: "main",
      path: "C:/notes/a.md",
    });

    emit.mockClear();
    fire("plain:recent-opened", { from: "w2", path: "C:/notes/b.md" });

    expect(useStore.getState().recent).toEqual(["C:/notes/b.md", "C:/notes/a.md"]);
    // Whatever came in must not go straight back out again, or two windows
    // would answer each other for ever (§4.4).
    expect(emit).not.toHaveBeenCalled();
    stop();
  });

  it("ignores what it said itself (M1: one window hears only itself)", () => {
    const stop = installRecentSync();
    useStore.setState({ recent: ["C:/notes/a.md"] });
    emit.mockClear();

    fire("plain:recent-opened", { from: "main", path: "C:/notes/b.md" });

    expect(useStore.getState().recent).toEqual(["C:/notes/a.md"]);
    stop();
  });

  /** Save As and a rename in the tree both go through `renameDoc` (§4.4). */
  it("says a document that was saved under a new name", () => {
    useStore.getState().openDoc(makeDoc({ id: "untitled-main-1", path: null, text: "a" }));
    const stop = installRecentSync();
    emit.mockClear();

    useStore.getState().renameDoc("untitled-main-1", "C:/notes/new.md");

    expect(emit).toHaveBeenCalledWith("plain:recent-opened", {
      from: "main",
      path: "C:/notes/new.md",
    });
    stop();
  });

  /** Emptying the list moves the head to nothing, and nothing is not a file. */
  it("says nothing when the last entry is forgotten", () => {
    useStore.setState({ recent: ["C:/notes/a.md"] });
    const stop = installRecentSync();
    emit.mockClear();

    useStore.getState().forgetRecent("C:/notes/a.md");

    expect(useStore.getState().recent).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
    stop();
  });
});

/* ------------------------------------------------------- (и) activation */

describe("a document another window asked for", () => {
  it("is activated by the canonical key it was published under", async () => {
    canonical.set("C:/KOTENO~1/a.md", "C:/Kotenochek/a.md");
    const stop = installDocRegistry();
    installActivateDoc();
    useStore
      .getState()
      .openDoc(makeDoc({ id: "c:/koteno~1/a.md", path: "C:/KOTENO~1/a.md", text: "a" }));
    useStore.getState().openDoc(makeDoc({ id: "c:/notes/b.md", path: "C:/notes/b.md", text: "b" }));
    await flush();

    fire("plain:activate-doc", "c:/kotenochek/a.md");
    expect(useStore.getState().activeId).toBe("c:/koteno~1/a.md");

    // A key we never published is not ours to show.
    fire("plain:activate-doc", "c:/notes/nothing.md");
    expect(useStore.getState().activeId).toBe("c:/koteno~1/a.md");
    stop();
  });
});

/* ---------------------------------------------------------- (к) Save As */

describe("save as onto a file another window has open", () => {
  it("writes nothing and says where it is", async () => {
    heldBy("w2", "c:/notes/taken.md");
    saveDialog.mockResolvedValue("C:/notes/taken.md");
    useStore.setState({
      docs: [makeDoc({ id: "c:/notes/a.md", path: "C:/notes/a.md", text: "a", dirty: true })],
      activeId: "c:/notes/a.md",
    });

    expect(await saveAs("c:/notes/a.md")).toBe(false);
    expect(writeFileAtomic).not.toHaveBeenCalled();
    expect(useStore.getState().message).toBe(
      "taken.md is open in another window — close it there first",
    );
  });
});

/* -------------------------------------------------------- (е) settings */

describe("the settings every window shares", () => {
  it("is heard through one listener, however often it is installed", async () => {
    await installSettingsSync();
    await installSettingsSync();

    // A second listener would apply every change twice, and a second
    // registration that nobody waited for could miss one (W13 §7.2).
    expect(listeners["plain:settings-changed"]).toHaveLength(1);
  });

  /**
   * The event says the file is there. Sent before the write, a window that
   * applied it would be showing a value the next start cannot give back.
   */
  it("is announced only after settings.json is really written", async () => {
    invoke.mockImplementation(async (command) => {
      log.push(command);
      return command === "data_path" ? "C:/data" : null;
    });

    saveSettings({ ...DEFAULTS, appearance: { ...DEFAULTS.appearance, theme: "dark" } });
    await flushSettings();

    const wrote = log.indexOf("write_text_atomic");
    const said = log.indexOf("emit:plain:settings-changed");
    expect(wrote).toBeGreaterThanOrEqual(0);
    expect(said).toBeGreaterThan(wrote);
  });
});
