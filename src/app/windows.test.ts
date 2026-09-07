// One file lives in one window (spec §8). Two windows on the same document
// would be two buffers, two drafts under one name and two saves racing each
// other, so opening a file another window already has brings that window
// forward instead of reading the file a second time.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileInfo } from "./fs";

const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();
const readFile = vi.fn<(path: string) => Promise<FileInfo>>();

vi.mock("./env", () => ({ inTauri: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a?: unknown) => invoke(c, a) }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => undefined),
  listen: vi.fn(async () => () => undefined),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ label: "main" }),
}));
vi.mock("./fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fs")>()),
  readFile: (path: string) => readFile(path),
  hashFile: vi.fn(async () => null),
  writeTextAtomic: vi.fn(async () => undefined),
}));

const { openPaths } = await import("./commands");
const { useStore } = await import("./store");
const { clearBuffers } = await import("../editor/buffers");

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
  invoke.mockImplementation(async (command) =>
    command === "holding_window" ? [{ label, key }] : undefined,
  );
}

beforeEach(() => {
  invoke.mockReset();
  readFile.mockReset();
  readFile.mockImplementation(async (path) => fileInfo(path));
  clearBuffers();
  useStore.setState({ docs: [], activeId: null, recent: [], banners: [], message: "" });
});

describe("opening a file another window has", () => {
  it("does not read it again, and brings that window forward", async () => {
    heldBy("w2", "c:/notes/a.md");

    const opened = await openPaths(["C:/notes/a.md"]);

    expect(opened).toBe(false);
    expect(readFile).not.toHaveBeenCalled();
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
    expect(readFile).toHaveBeenCalledWith("C:/notes/a.md");
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
});

describe("a nameless buffer", () => {
  it("is named after the window that made it, so two windows cannot collide", async () => {
    heldByNobody();
    const { newDoc } = await import("./commands");
    newDoc();
    expect(useStore.getState().docs[0]?.id).toMatch(/^untitled-main-/);
  });
});
