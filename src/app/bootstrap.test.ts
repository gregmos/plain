// A file double-clicked in Finder does not come in argv: it arrives as an
// Apple Event, which Rust queues and announces with `open-path` (spec §13a).
// On a cold launch that announcement races the page, so it can land in the
// middle of startup — while the last session is still being restored.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileInfo } from "./fs";

/** The pending queues Rust keeps, and the nudge it sends (spec §13a). */
const rust = vi.hoisted(() => ({
  paths: [] as string[],
  folders: [] as string[],
  session: "",
  openPath: null as (() => void) | null,
}));

const disk = vi.hoisted(() => ({
  files: new Map<string, string>(),
  /** A read that only lands when the test says so. */
  holds: new Map<string, Promise<void>>(),
}));

vi.mock("./env", () => ({ inTauri: true }));

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, handler: () => void) => {
    if (name === "open-path") rust.openPath = handler;
    return () => {};
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (command: string) => {
    if (command === "data_path") return "C:/data";
    if (command === "take_pending_paths") return rust.paths.splice(0);
    if (command === "take_pending_folders") return rust.folders.splice(0);
    return null;
  },
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: async (...parts: string[]) => parts.join("/"),
  appDataDir: async () => "C:/data",
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  // Only the session file is there: no settings.json, no drafts folder.
  exists: async (path: string) => path.endsWith("state.json"),
  readTextFile: async () => rust.session,
  readDir: async () => [],
  remove: async () => undefined,
  mkdir: async () => undefined,
}));

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
  writeTextAtomic: async () => undefined,
}));

const { bootstrap } = await import("./bootstrap");
const { pathKey } = await import("./paths");
const { useStore } = await import("./store");

const SESSION = "C:/notes/yesterday.md";
const FINDER = "C:/notes/double-clicked.md";
const LATER = "C:/notes/later.md";

/** Everything that is not waiting on the test runs to a standstill. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function held(): { promise: Promise<void>; release: () => void } {
  let release = (): void => {};
  const promise = new Promise<void>((resolve) => (release = resolve));
  return { promise, release };
}

beforeEach(() => {
  rust.paths = [];
  rust.folders = [];
  disk.files.clear();
  disk.holds.clear();
  useStore.setState({
    docs: [],
    activeId: null,
    banners: [],
    recent: [],
    railCollapsed: false,
    railAuto: false,
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
    rust.openPath?.();
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
    rust.openPath?.();
    await flush();

    expect(useStore.getState().activeId).toBe(pathKey(LATER));
    expect(useStore.getState().docs).toHaveLength(3);
  });
});
