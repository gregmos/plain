// Replacing a buffer with an older version of itself is the one operation
// here that can destroy text nobody has a second copy of (reviews #1, #2, #4),
// plus the autosave clock reacting to its own setting (review #6).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileInfo } from "./fs";
import type { Comparison } from "./store";

const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();
const readFile = vi.fn();
const hashFile = vi.fn<(path: string) => Promise<string | null>>();
const writeFileAtomic = vi.fn();

vi.mock("./env", () => ({ inTauri: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a?: unknown) => invoke(c, a) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async () => false),
  readDir: vi.fn(async () => []),
  readTextFile: vi.fn(async () => "{}"),
  remove: vi.fn(async () => undefined),
}));
vi.mock("./fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fs")>()),
  readFile: (path: string, encoding?: string) => readFile(path, encoding),
  hashFile: (path: string) => hashFile(path),
  writeFileAtomic: (request: unknown) => writeFileAtomic(request),
  canonicalPath: async (path: string) => path,
  writeTextAtomic: vi.fn(async () => undefined),
  trashPath: vi.fn(async () => undefined),
}));

const { installAutosave, reloadFromDisk, restoreIntoBuffer, restoreSnapshot, takeComparison } =
  await import("./save");
const { clearBuffers } = await import("../editor/buffers");
const { DEFAULTS } = await import("./settings");
const { makeDoc, useStore } = await import("./store");

const PATH = "C:/notes/a.md";
const ID = "c:/notes/a.md";

function fileInfo(text: string, hash: string): FileInfo {
  return {
    path: PATH,
    text,
    encoding: "utf-8",
    bom: false,
    eol: "lf",
    dominantEol: "lf",
    finalNewline: true,
    hash,
    mtimeMs: 0,
    size: text.length,
    readOnly: false,
    decodeErrors: false,
    hardLinks: 1,
  };
}

function open(over: Partial<Record<string, unknown>> = {}) {
  const doc = makeDoc({
    id: ID,
    path: PATH,
    text: "buffer\n",
    savedText: "on disk\n",
    dirty: true,
    baseHash: "diskhash",
    ...over,
  });
  useStore.setState({ docs: [doc], activeId: doc.id, dialog: null, banners: [] });
  return doc;
}

const text = () => useStore.getState().docs[0]?.text;

beforeEach(() => {
  vi.clearAllMocks();
  clearBuffers();
  useStore.setState({ docs: [], activeId: null, banners: [], comparison: null });
  invoke.mockResolvedValue(null);
  hashFile.mockResolvedValue("diskhash");
});

/* ------------------------------------------------------------ review #1 */

describe("the copy taken before a restore", () => {
  it("goes first, and the buffer is replaced only after it lands", async () => {
    open();
    expect(await restoreIntoBuffer({ id: ID, text: "older\n", note: "restored" })).toBe(true);
    expect(invoke).toHaveBeenCalledWith("snapshot_text", expect.anything());
    expect(text()).toBe("older\n");
  });

  // The whole point of the copy: without it, the text in the buffer is the
  // only text there is, and replacing it destroys it.
  it("stops the restore when it cannot be written at all", async () => {
    open();
    invoke.mockRejectedValue(new Error("disk full"));

    expect(await restoreIntoBuffer({ id: ID, text: "older\n", note: "restored" })).toBe(false);
    expect(text()).toBe("buffer\n");
    expect(useStore.getState().banners[0]?.text).toContain("nothing was replaced");
  });

  // cp1251 cannot hold an emoji the buffer picked up; a UTF-8 copy is worth
  // more than one that matches the file's encoding.
  it("falls back to utf-8 when the file's own encoding cannot hold the text", async () => {
    open({ encoding: "windows-1251" });
    invoke.mockImplementation(async (_command, args) => {
      const request = (args as { request: { encoding: string } }).request;
      if (request.encoding !== "utf-8") throw new Error("can't encode in windows-1251");
      return null;
    });

    expect(await restoreIntoBuffer({ id: ID, text: "older\n", note: "restored" })).toBe(true);
    expect(text()).toBe("older\n");
    const encodings = invoke.mock.calls.map(
      (call) => (call[1] as { request: { encoding: string } }).request.encoding,
    );
    expect(encodings).toEqual(["windows-1251", "utf-8"]);
  });

  it("leaves the document unsaved: a snapshot is not on disk", async () => {
    open();
    await restoreIntoBuffer({ id: ID, text: "older\n", note: "restored" });
    expect(useStore.getState().docs[0]?.dirty).toBe(true);
    expect(useStore.getState().docs[0]?.savedText).toBe("on disk\n");
  });

  it("reads the snapshot for the history screen and hands it over", async () => {
    open();
    readFile.mockResolvedValue(fileInfo("from the snapshot\n", "snaphash"));

    expect(await restoreSnapshot(ID, "C:/history/x.md")).toBe(true);
    expect(readFile).toHaveBeenCalledWith("C:/history/x.md", undefined);
    expect(text()).toBe("from the snapshot\n");
  });
});

/* ------------------------------------------------------------ review #2 */

describe("taking the version the diff screen drew", () => {
  const comparison = (over: Partial<Comparison> = {}): Comparison => ({
    id: ID,
    leftLabel: "disk",
    left: "on disk now\n",
    rightLabel: "buffer",
    right: "buffer\n",
    takeLabel: "take disk",
    fromDisk: true,
    diskInfo: fileInfo("on disk now\n", "diskhash"),
    ...over,
  });

  it("applies that exact version, and makes the document clean", async () => {
    open();
    expect(await takeComparison(comparison())).toBe(true);
    expect(text()).toBe("on disk now\n");
    expect(useStore.getState().docs[0]?.baseHash).toBe("diskhash");
    expect(useStore.getState().docs[0]?.dirty).toBe(false);
  });

  // Anything typed between the click and the swap was never part of the
  // choice the screen offered.
  it("does not overwrite text typed after the click", async () => {
    open();
    invoke.mockImplementation(async () => {
      // The buffer moves while the safety copy is being written.
      useStore.getState().updateDoc(ID, { text: "typed after the click\n" });
      return null;
    });

    expect(await takeComparison(comparison())).toBe(false);
    expect(text()).toBe("typed after the click\n");
    expect(useStore.getState().docs[0]?.baseHash).toBe("diskhash");
  });

  it("refuses a version the disk has already moved past, and re-draws", async () => {
    open();
    hashFile.mockResolvedValue("someone else wrote");
    readFile.mockResolvedValue(fileInfo("newer on disk\n", "someone else wrote"));

    expect(await takeComparison(comparison())).toBe(false);
    expect(text()).toBe("buffer\n");
    expect(useStore.getState().comparison?.left).toBe("newer on disk\n");
  });

  it("a snapshot side does not touch the base hash", async () => {
    open();
    const taken = await takeComparison(
      comparison({ left: "from a snapshot\n", fromDisk: false, diskInfo: undefined }),
    );
    expect(taken).toBe(true);
    expect(text()).toBe("from a snapshot\n");
    expect(useStore.getState().docs[0]?.baseHash).toBe("diskhash");
    expect(useStore.getState().docs[0]?.dirty).toBe(true);
  });
});

/* ---------------------------------------------------------------- §8 */

describe("the version a quiet reload replaces", () => {
  interface Asked {
    text: string;
    force: boolean;
    /** What the buffer held at the moment the copy was asked for. */
    onScreen: string | undefined;
  }

  /**
   * Records every `snapshot_text`, so the order can be checked afterwards.
   * `answer` is what the copy does — fail, or hang until the test lets go.
   */
  function watchSnapshots(answer: () => Promise<unknown> = async () => null): Asked[] {
    const asked: Asked[] = [];
    invoke.mockImplementation(async (command, args) => {
      if (command !== "snapshot_text") return null;
      const request = (args as { request: { text: string; force: boolean } }).request;
      asked.push({ text: request.text, force: request.force, onScreen: text() });
      return await answer();
    });
    return asked;
  }

  /** A promise the test holds open, so something can land in the middle. */
  function gate<T>(): { promise: Promise<T>; open: (value: T) => void } {
    let open = (_value: T): void => undefined;
    const promise = new Promise<T>((resolve) => {
      open = resolve;
    });
    return { promise, open };
  }

  function clean(text: string) {
    return open({ text, savedText: text, dirty: false });
  }

  it("goes into the history first, past the five-minute rule", async () => {
    clean("before the agent\n");
    readFile.mockResolvedValue(fileInfo("after the agent\n", "newhash"));
    const asked = watchSnapshots();

    await reloadFromDisk(ID);
    // The copy is of what was on screen, and the buffer still held it.
    expect(asked).toEqual([
      { text: "before the agent\n", force: true, onScreen: "before the agent\n" },
    ]);
    expect(text()).toBe("after the agent\n");
    expect(useStore.getState().note).toBe("reloaded from disk · previous version kept in history");
  });

  // A watcher hit on a file whose bytes came back the same is not a version.
  it("is not kept when the file came back the way the buffer already has it", async () => {
    clean("unchanged\n");
    readFile.mockResolvedValue(fileInfo("unchanged\n", "newhash"));
    const asked = watchSnapshots();

    await reloadFromDisk(ID);
    expect(asked).toEqual([]);
    expect(useStore.getState().note).toBe("reloaded from disk");
    expect(useStore.getState().docs[0]?.baseHash).toBe("newhash");
  });

  // Unlike a restore, the reload is not a choice the user made: refusing to
  // do it would leave stale text on screen for a reason nobody asked about.
  it("does not hold the reload back when the copy cannot be written", async () => {
    clean("before the agent\n");
    readFile.mockResolvedValue(fileInfo("after the agent\n", "newhash"));
    watchSnapshots(() => Promise.reject(new Error("disk full")));

    await reloadFromDisk(ID);
    expect(text()).toBe("after the agent\n");
    expect(useStore.getState().note).toBe("reloaded from disk");
  });

  it("is on screen only once the copy has landed", async () => {
    clean("before the agent\n");
    readFile.mockResolvedValue(fileInfo("after the agent\n", "newhash"));
    const writing = gate<null>();
    const asked = watchSnapshots(() => writing.promise);

    const running = reloadFromDisk(ID);
    await vi.waitFor(() => expect(asked).toHaveLength(1));
    // The copy is still being written, so the text it copies is still there.
    expect(text()).toBe("before the agent\n");

    writing.open(null);
    await running;
    expect(text()).toBe("after the agent\n");
  });

  // The conflict banner's `reload`, where the text being thrown away is the
  // user's own and worth more than anything.
  it("keeps the buffer the user agreed to lose", async () => {
    open();
    readFile.mockResolvedValue(fileInfo("on disk now\n", "newhash"));
    const asked = watchSnapshots();

    await reloadFromDisk(ID, { force: true });
    expect(asked.map((a) => a.text)).toEqual(["buffer\n"]);
    expect(text()).toBe("on disk now\n");
  });

  // Typed while the copy was being written: that keystroke was never part of
  // anything the user was told about (spec §8).
  it("leaves the buffer alone when it moves while the copy is written", async () => {
    clean("before the agent\n");
    readFile.mockResolvedValue(fileInfo("after the agent\n", "newhash"));
    invoke.mockImplementation(async () => {
      useStore.getState().updateDoc(ID, { text: "typed just now\n" });
      return null;
    });

    await reloadFromDisk(ID);
    expect(text()).toBe("typed just now\n");
    expect(useStore.getState().banners[0]?.text).toBe("file changed on disk");
  });

  // `reload` in the banner is permission to lose the edits the dialog named,
  // not the ones made after the answer (review w14 #1).
  it("leaves it alone under force too, and asks again", async () => {
    open();
    readFile.mockResolvedValue(fileInfo("on disk now\n", "newhash"));
    const writing = gate<null>();
    const asked = watchSnapshots(() => writing.promise);

    const running = reloadFromDisk(ID, { force: true });
    await vi.waitFor(() => expect(asked).toHaveLength(1));
    useStore.getState().updateDoc(ID, { text: "typed after the answer\n" });
    writing.open(null);
    await running;

    expect(text()).toBe("typed after the answer\n");
    expect(useStore.getState().banners[0]?.text).toBe("file changed on disk");
  });

  // `F5` reloads without the watcher's guard, so two reloads of one change
  // can overlap. The second finding the work done is not a conflict.
  it("says nothing when another reload of the same change got there first", async () => {
    clean("before the agent\n");
    const disk = fileInfo("after the agent\n", "newhash");
    const late = gate<FileInfo>();
    readFile.mockResolvedValueOnce(disk).mockReturnValueOnce(late.promise);
    const asked = watchSnapshots();

    const first = reloadFromDisk(ID);
    const second = reloadFromDisk(ID);
    await first;
    late.open(disk);
    await second;

    expect(asked).toHaveLength(1);
    expect(text()).toBe("after the agent\n");
    expect(useStore.getState().banners).toEqual([]);
  });
});

/* ------------------------------------------------------------ review #6 */

describe("autosave answers to its own setting", () => {
  const settings = (autosave: number) => ({
    ...DEFAULTS,
    files: { ...DEFAULTS.files, autosave },
  });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("turning it off cancels the wait that was already running", async () => {
    useStore.setState({ settings: settings(5) });
    const stop = installAutosave();
    open();
    useStore.getState().updateDoc(ID, { text: "typed\n" });
    await vi.advanceTimersByTimeAsync(1000);

    useStore.getState().applySettings(settings(0));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(writeFileAtomic).not.toHaveBeenCalled();
    stop();
  });

  it("a new interval starts the wait again from now", async () => {
    useStore.setState({ settings: settings(30) });
    const stop = installAutosave();
    open();
    useStore.getState().updateDoc(ID, { text: "typed\n" });
    await vi.advanceTimersByTimeAsync(1000);

    // Down to two seconds: the file is written two seconds from the change,
    // not twenty-nine seconds from the keystroke.
    writeFileAtomic.mockResolvedValue({ hash: "h", snapshotError: null });
    useStore.getState().applySettings(settings(2));
    await vi.advanceTimersByTimeAsync(2000);
    expect(writeFileAtomic).toHaveBeenCalledTimes(1);
    stop();
  });
});
