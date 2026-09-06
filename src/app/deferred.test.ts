// `later` on the recovery screen: neither restored nor discarded. The danger
// is that a deferred draft keeps its working name, where the session that
// starts a moment later overwrites or deletes it (review w11 #1).

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();
const files = new Map<string, string>();

vi.mock("./env", () => ({ inTauri: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a?: unknown) => invoke(c, a) }));
vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: async () => "/data",
  join: async (...parts: string[]) => parts.join("/"),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: async (path: string) =>
    files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`)),
  readDir: async (path: string) =>
    [...files.keys()]
      .filter((key) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes("/"))
      .map((key) => ({ name: key.slice(path.length + 1), isFile: true })),
  readTextFile: async (path: string) => {
    const text = files.get(path);
    if (text === undefined) throw new Error("no such file");
    return text;
  },
  remove: async (path: string) => {
    files.delete(path);
  },
}));
vi.mock("./fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fs")>()),
  writeTextAtomic: async (path: string, text: string) => {
    files.set(path, text);
  },
}));

const { deferDraft, documentKey, dropDraft, listDrafts, writeDraft } = await import("./drafts");
const { clearBuffers } = await import("../editor/buffers");
const { makeDoc, useStore } = await import("./store");

const PATH = "C:/notes/a.md";
const ID = "c:/notes/a.md";
const doc = { id: ID, path: PATH };
const working = `/data/drafts/${documentKey(doc)}.json`;
const deferred = `/data/drafts/deferred/${documentKey(doc)}.json`;

const record = (text: string) =>
  JSON.stringify({ text, path: PATH, id: ID, title: "a.md", savedAt: 1, baseHash: "h" });

beforeEach(() => {
  vi.clearAllMocks();
  files.clear();
  clearBuffers();
  useStore.setState({ docs: [], activeId: null });
  invoke.mockImplementation(async (command) => (command === "data_path" ? "/data" : true));
});

describe("later puts a draft beyond the reach of the next session", () => {
  it("moves it out of the working name", async () => {
    files.set(working, record("unsaved\n"));

    expect(await deferDraft({ file: working, path: PATH, title: "a.md", savedAt: 1 })).toBe(true);
    expect(files.get(deferred)).toBe(record("unsaved\n"));
    expect(files.has(working)).toBe(false);
  });

  // The exact way it used to be lost: `later`, then the restored session
  // closes a clean document, and `close.ts` drops the draft for that path.
  it("survives the dropDraft that closing a clean document does", async () => {
    files.set(working, record("unsaved\n"));
    await deferDraft({ file: working, path: PATH, title: "a.md", savedAt: 1 });

    await dropDraft(doc);
    expect(files.has(deferred)).toBe(true);
  });

  // The other way it used to be lost: an edit to the same file writes over it.
  it("survives a new draft written for the same document", async () => {
    files.set(working, record("deferred text\n"));
    await deferDraft({ file: working, path: PATH, title: "a.md", savedAt: 1 });

    const open = makeDoc({ id: ID, path: PATH, text: "new text\n", savedText: "on disk\n" });
    useStore.setState({ docs: [open], activeId: ID });
    await writeDraft(ID);

    expect(files.get(deferred)).toContain("deferred text");
    expect(files.get(working)).toContain("new text");
  });

  it("is offered again at the next start, working drafts too", async () => {
    files.set(deferred, record("put aside\n"));
    files.set("/data/drafts/other1234.json", record("still working\n"));

    const listed = await listDrafts();
    expect(listed.map((entry) => entry.file).sort()).toEqual(
      [deferred, "/data/drafts/other1234.json"].sort(),
    );
  });

  it("leaves an already-deferred draft where it is", async () => {
    files.set(deferred, record("put aside\n"));
    expect(await deferDraft({ file: deferred, path: PATH, title: "a.md", savedAt: 1 })).toBe(true);
    expect(files.get(deferred)).toBe(record("put aside\n"));
    expect(files.size).toBe(1);
  });

  it("does not lose the draft when it cannot be moved", async () => {
    files.set(working, record("unsaved\n"));
    const fs = await import("./fs");
    vi.spyOn(fs, "writeTextAtomic").mockRejectedValueOnce(new Error("disk full"));

    expect(await deferDraft({ file: working, path: PATH, title: "a.md", savedAt: 1 })).toBe(false);
    expect(files.has(working)).toBe(true);
  });
});
