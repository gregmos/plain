import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Backlink } from "../app/store";

const rust = vi.hoisted(() => ({
  calls: [] as Record<string, unknown>[],
  answer: [] as Backlink[],
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: Record<string, unknown>) => {
    if (cmd !== "backlinks") return null;
    rust.calls.push(args);
    return rust.answer;
  },
}));

vi.mock("../app/env", () => ({ inTauri: true }));

const { clearBacklinks, reloadBacklinks } = await import("./backlinks");
const { makeDoc, useStore } = await import("../app/store");

// The short 8.3 spelling of the library, against the long one of the file:
// this is what a folder argument and a canonicalized document really look
// like, and comparing them as strings used to leave `links here` empty.
const ROOT = "C:\\Users\\KOTENO~1\\notes";
const DOC = "C:\\Users\\Kotenochek\\notes\\проекты\\plain\\тз.md";

const found: Backlink[] = [
  { path: "C:\\lib\\index.md", rel: "index.md", name: "index.md", line: 20, text: "[[тз]]" },
];

beforeEach(() => {
  rust.calls.length = 0;
  rust.answer = found;
  clearBacklinks();
  useStore.setState({ docs: [], activeId: null, backlinks: [], libraryPath: null });
});

function open(path: string) {
  useStore.getState().openDoc(makeDoc({ id: path.toLowerCase(), path, text: "x" }));
}

describe("reloadBacklinks", () => {
  it("asks Rust for the document itself, not for a path worked out here", async () => {
    useStore.getState().setLibraryPath(ROOT);
    open(DOC);
    await reloadBacklinks();

    expect(rust.calls).toHaveLength(1);
    expect(rust.calls[0]).toMatchObject({ root: ROOT, path: DOC });
    expect(useStore.getState().backlinks).toEqual(found);
  });

  it("asks once per document and remembers the answer", async () => {
    useStore.getState().setLibraryPath(ROOT);
    open(DOC);
    await reloadBacklinks();
    await reloadBacklinks();
    expect(rust.calls).toHaveLength(1);
    expect(useStore.getState().backlinks).toEqual(found);
  });

  it("asks again once the folder has changed under it", async () => {
    useStore.getState().setLibraryPath(ROOT);
    open(DOC);
    await reloadBacklinks();
    clearBacklinks();
    await reloadBacklinks();
    expect(rust.calls).toHaveLength(2);
  });

  it("has nothing to say without a library or without a document", async () => {
    open(DOC);
    await reloadBacklinks();
    expect(rust.calls).toHaveLength(0);
    expect(useStore.getState().backlinks).toEqual([]);

    useStore.setState({ docs: [], activeId: null });
    useStore.getState().setLibraryPath(ROOT);
    await reloadBacklinks();
    expect(rust.calls).toHaveLength(0);
  });

  it("empties the section rather than showing another document's links", async () => {
    rust.answer = [];
    useStore.setState({ backlinks: found });
    useStore.getState().setLibraryPath(ROOT);
    open(DOC);
    await reloadBacklinks();
    expect(useStore.getState().backlinks).toEqual([]);
  });
});
