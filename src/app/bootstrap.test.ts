// A file double-clicked in Finder does not come in argv: it arrives as an
// Apple Event, which Rust queues and announces with `open-path` (spec §13a).
// On a cold launch that announcement races the page, so it can land in the
// middle of startup — while the last session is still being restored.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileInfo } from "./fs";

/**
 * The packet Rust keeps for this window, the nudge it sends (spec §13a), and
 * the label it was built under — `main`, or one of the windows a run grows
 * later (W13 §2.2).
 */
const rust = vi.hoisted(() => ({
  label: "main",
  paths: [] as string[],
  folders: [] as string[],
  /** What `new_window` seeded this one with; `main` is never given one. */
  seed: null as unknown,
  session: "",
  /** settings.json, when the test wants there to be one. */
  settings: null as string | null,
  /** Holds `allow_asset_dir`, so a window can be caught mid-startup. */
  holdLibrary: null as Promise<void> | null,
  /** Which window Rust says writes state.json when it is asked (W13 §4.2). */
  writer: "main",
  openPath: null as ((event: { payload: unknown }) => void) | null,
  settingsChanged: null as ((event: { payload: unknown }) => void) | null,
}));

const disk = vi.hoisted(() => ({
  files: new Map<string, string>(),
  /** A read that only lands when the test says so. */
  holds: new Map<string, Promise<void>>(),
}));

vi.mock("./env", () => ({ inTauri: true }));

vi.mock("@tauri-apps/api/event", () => ({
  emit: async () => undefined,
  listen: async (name: string, handler: (event: { payload: unknown }) => void) => {
    if (name === "open-path") rust.openPath = handler;
    if (name === "plain:settings-changed") rust.settingsChanged = handler;
    return () => {};
  },
}));

const invoke = vi.hoisted(() =>
  vi.fn(async (command: string, _args?: unknown) => {
    if (command === "data_path") return "C:/data";
    if (command === "take_opening") {
      return { paths: rust.paths.splice(0), folders: rust.folders.splice(0), seed: rust.seed };
    }
    if (command === "holding_window") return [];
    if (command === "session_writer") return rust.writer;
    if (command === "allow_asset_dir") await rust.holdLibrary;
    return null;
  }),
);

vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a?: unknown) => invoke(c, a) }));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: rust.label }),
}));

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ setZoom: async () => undefined }),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: async (...parts: string[]) => parts.join("/"),
  appDataDir: async () => "C:/data",
}));

const readDir = vi.hoisted(() => vi.fn(async () => [] as unknown[]));

vi.mock("@tauri-apps/plugin-fs", () => ({
  // Only the session file is there: no drafts folder, and no settings.json
  // unless the test puts one there.
  exists: async (path: string) =>
    path.endsWith("state.json") || (path.endsWith("settings.json") && rust.settings !== null),
  readTextFile: async (path: string) => {
    await disk.holds.get(path);
    return path.endsWith("settings.json") ? (rust.settings as string) : rust.session;
  },
  readDir: () => readDir(),
  remove: async () => undefined,
  mkdir: async () => undefined,
}));

const writeTextAtomic = vi.hoisted(() =>
  vi.fn(async (_path: string, _text: string) => undefined),
);

vi.mock("./fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fs")>()),
  readFile: async (path: string): Promise<FileInfo> => {
    await disk.holds.get(path);
    const text = disk.files.get(path);
    if (text === undefined) throw { kind: "io", message: "not found (os error 3)" };
    return {
      path,
      text,
      encoding: "utf-8",
      bom: false,
      eol: "lf",
      dominantEol: "lf",
      finalNewline: true,
      hash: "hash",
      mtimeMs: 0,
      size: text.length,
      readOnly: false,
      decodeErrors: false,
      hardLinks: 1,
    };
  },
  canonicalPath: async (path: string) => path,
  writeTextAtomic: (path: string, text: string) => writeTextAtomic(path, text),
}));

const { bootstrap } = await import("./bootstrap");
const { pathKey } = await import("./paths");
const { readingPosition } = await import("./session");
const { useStore } = await import("./store");

const SESSION = "C:/notes/yesterday.md";
const FINDER = "C:/notes/double-clicked.md";
const LATER = "C:/notes/later.md";

/** Everything that is not waiting on the test runs to a standstill. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A window of its own: `startupSettled` is made once per module graph, so a
 * second window in this file needs a second graph. The fresh graph comes with
 * a fresh `platform`, and the pin vitest.setup.ts put on the first one cannot
 * reach it — on a macOS host `isMac()` would be true there, `pathKey` would
 * stop lowercasing and `DEFAULTS` would change, while the expectations here
 * are the pinned module's. So it is pinned again before anything imports it.
 */
async function freshWindow(): Promise<void> {
  vi.resetModules();
  (await import("./platform")).setMacForTests(false);
}

function held(): { promise: Promise<void>; release: () => void } {
  let release = (): void => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

beforeEach(() => {
  rust.label = "main";
  rust.paths = [];
  rust.folders = [];
  rust.seed = null;
  rust.session = "";
  rust.settings = null;
  rust.holdLibrary = null;
  rust.writer = "main";
  disk.files.clear();
  disk.holds.clear();
  invoke.mockClear();
  readDir.mockClear();
  writeTextAtomic.mockClear();
  useStore.setState({
    docs: [],
    activeId: null,
    banners: [],
    recent: [],
    railCollapsed: false,
    railAuto: false,
    libraryPath: null,
    zoom: 1,
    recovery: null,
  });
});

describe("a file that arrives from Finder while startup is still running", () => {
  it("opens on top of the restored session instead of under it", async () => {
    disk.files.set(SESSION, "# yesterday");
    disk.files.set(FINDER, "# double-clicked");
    rust.session = JSON.stringify({
      version: 1,
      files: [{ path: SESSION, mode: "read", caret: null }],
      active: SESSION,
    });

    // The session's file is slow to read — which is the whole race: it is
    // slower than the one file the Apple Event brings.
    const slow = held();
    disk.holds.set(SESSION, slow.promise);

    const started = bootstrap();
    await flush();
    expect(useStore.getState().docs).toHaveLength(0);

    // Finder's file lands in the middle of `restore()`. Draining the queue
    // here is what used to lose it: the session's `activate` came last.
    rust.paths.push(FINDER);
    rust.openPath?.({ payload: null });
    await flush();
    expect(useStore.getState().docs).toHaveLength(0);

    slow.release();
    await started;
    await flush();

    expect(useStore.getState().activeId).toBe(pathKey(FINDER));
    expect(useStore.getState().docs.map((d) => d.id)).toEqual([
      pathKey(SESSION),
      pathKey(FINDER),
    ]);
    // Waiting must not cost it the rest of the treatment a file gets (spec §6).
    expect(useStore.getState().railCollapsed).toBe(true);

    // Startup is over, and the same listener now has nothing to wait for: a
    // second launch, or a file dropped on the Dock icon, opens at once.
    disk.files.set(LATER, "# later");
    rust.paths.push(LATER);
    rust.openPath?.({ payload: null });
    await flush();

    expect(useStore.getState().activeId).toBe(pathKey(LATER));
    expect(useStore.getState().docs).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ W13 */

const LIBRARY = "C:/notes";

/** What `file → new window` hands the window it makes (W13 §1.2, §2.2). */
function seed(over: Record<string, unknown> = {}): unknown {
  return {
    version: 1,
    files: [],
    active: null,
    rail: { collapsed: true, view: "outline", width: 260 },
    split: 0.5,
    library: LIBRARY,
    collapsed: [],
    librarySort: "modified",
    recent: [SESSION],
    recentLibraries: [LIBRARY],
    zoom: 1.25,
    reading: [["c:/notes/yesterday.md", "intro"]],
    ...over,
  };
}

describe("a window that was made by the one already running", () => {
  it("starts on its seed, and leaves state.json and the drafts alone", async () => {
    rust.label = "w2";
    rust.seed = seed();
    // If state.json were read this would be the session it came back with.
    rust.session = JSON.stringify({
      version: 1,
      files: [{ path: SESSION, mode: "read", caret: null }],
      active: SESSION,
    });
    disk.files.set(SESSION, "# yesterday");

    await bootstrap();
    await flush();

    // The seed, not the file: nothing of the last run is in this window.
    expect(useStore.getState().libraryPath).toBe(LIBRARY);
    expect(useStore.getState().railView).toBe("outline");
    expect(useStore.getState().zoom).toBeCloseTo(1.25);
    expect(useStore.getState().docs).toHaveLength(0);
    // The reading positions are the app's, and the seed carries them (§2.2).
    expect(readingPosition(SESSION)).toBe("intro");
    // `unsaved work found` belongs to the window a run starts with (M7), and
    // state.json to `main` alone (M3).
    expect(readDir).not.toHaveBeenCalled();
    expect(writeTextAtomic).not.toHaveBeenCalled();
    expect(useStore.getState().recovery).toBeNull();
  });

  it("keeps its seed when a path arrives in the middle of its startup", async () => {
    rust.label = "w2";
    rust.seed = seed();
    disk.files.set(LATER, "# later");

    // `startupSettled` is made once per window, and the window this file has
    // been running already settled above — so this one gets its own modules,
    // and hands the shared handlers back when it is done with them.
    const handlers = { path: rust.openPath, settings: rust.settingsChanged };
    await freshWindow();
    const second = await import("./bootstrap");
    const store = (await import("./store")).useStore;
    try {
      // The library is slow to take, which is the whole race: the window is
      // still starting when the path lands.
      const slow = held();
      rust.holdLibrary = slow.promise;
      const open = second.bootstrap();
      await flush();

      rust.paths.push(LATER);
      rust.openPath?.({ payload: null });
      await flush();
      expect(store.getState().docs).toHaveLength(0);

      slow.release();
      await open;
      await flush();

      // Both: the seed was taken by bootstrap before the nudge could drain
      // it, and the path waited for the end of startup (§2.4).
      expect(store.getState().libraryPath).toBe(LIBRARY);
      expect(store.getState().docs.map((d) => d.id)).toEqual([pathKey(LATER)]);
      expect(writeTextAtomic).not.toHaveBeenCalled();
    } finally {
      rust.openPath = handlers.path;
      rust.settingsChanged = handlers.settings;
    }
  });
});

/**
 * The window that was writing state.json can close while this one is starting,
 * and Rust hands the role straight to it — before it has a window to write
 * (W13 §4.1, §4.2, §Д9 #3).
 */
describe("a window handed the session while it is still starting", () => {
  it("writes nothing until the start is over, and then writes what it restored", async () => {
    rust.label = "w2";
    rust.seed = seed();
    // Rust answers with this window: the role changed hands before the
    // listener could hear about it.
    rust.writer = "w2";

    const handlers = { path: rust.openPath, settings: rust.settingsChanged };
    await freshWindow();
    const second = await import("./bootstrap");
    const store = (await import("./store")).useStore;
    try {
      // The library is slow to take, so the window is caught mid-restore.
      const slow = held();
      rust.holdLibrary = slow.promise;
      const start = second.bootstrap();
      await flush();

      // Half a window: the seed's zoom and rail have not been applied yet.
      expect(store.getState().zoom).toBe(1);
      expect(writeTextAtomic).not.toHaveBeenCalled();

      slow.release();
      await start;
      await flush();

      expect(writeTextAtomic).toHaveBeenCalledTimes(1);
      const written = JSON.parse(writeTextAtomic.mock.calls[0]?.[1] as string) as {
        library: string;
        zoom: number;
      };
      expect(written.library).toBe(LIBRARY);
      expect(written.zoom).toBeCloseTo(1.25);
    } finally {
      rust.openPath = handlers.path;
      rust.settingsChanged = handlers.settings;
    }
  });

  /** The window a run starts with already has the role, and writing on being
   * told so would be a write startup never did in 0.2.3 (M1). */
  it("is not what `main` being told it is the writer means", async () => {
    rust.label = "main";
    rust.writer = "main";

    const handlers = { path: rust.openPath, settings: rust.settingsChanged };
    await freshWindow();
    const third = await import("./bootstrap");
    try {
      await third.bootstrap();
      await flush();

      expect(writeTextAtomic).not.toHaveBeenCalled();
    } finally {
      rust.openPath = handlers.path;
      rust.settingsChanged = handlers.settings;
    }
  });
});

describe("settings written by another window while this one is starting", () => {
  it("are applied on top of the file this window read (W13 §7.2)", async () => {
    rust.settings = JSON.stringify({ appearance: { theme: "light" } });
    const slow = held();
    disk.holds.set("C:/data/settings.json", slow.promise);

    const started = bootstrap();
    await flush();

    // The other window finished its write while our read was in flight; the
    // values it wrote are newer than the ones we are about to apply.
    rust.settingsChanged?.({
      payload: { from: "w2", settings: { appearance: { theme: "dark" } } },
    });
    await flush();

    slow.release();
    await started;
    await flush();

    expect(useStore.getState().settings.appearance.theme).toBe("dark");
  });

  it("are ignored when they are this window's own (M1)", async () => {
    rust.settings = JSON.stringify({ appearance: { theme: "light" } });
    const slow = held();
    disk.holds.set("C:/data/settings.json", slow.promise);

    const started = bootstrap();
    await flush();
    rust.settingsChanged?.({
      payload: { from: "main", settings: { appearance: { theme: "dark" } } },
    });
    slow.release();
    await started;
    await flush();

    expect(useStore.getState().settings.appearance.theme).toBe("light");
  });
});
