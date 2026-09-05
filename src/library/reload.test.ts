import { beforeEach, describe, expect, it, vi } from "vitest";

const rust = vi.hoisted(() => ({
  reads: [] as { root: string; extensions: string[] }[],
  /** root -> the names it holds. */
  folders: new Map<string, string[]>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: Record<string, unknown>) => {
    if (cmd !== "read_tree") return null;
    const root = String(args["root"]);
    rust.reads.push({ root, extensions: args["extensions"] as string[] });
    // A turn of the event loop, so a library switch can land mid-read.
    await Promise.resolve();
    return (rust.folders.get(root) ?? []).map((name) => ({
      name,
      path: `${root}\\${name}`,
      rel: name,
      dir: false,
      unreadable: false,
      mtimeMs: 0,
      ctimeMs: 0,
      children: [],
    }));
  },
}));

vi.mock("../app/env", () => ({ inTauri: true }));

const { reloadTree } = await import("./tree");
const { useStore } = await import("../app/store");

beforeEach(() => {
  rust.reads.length = 0;
  rust.folders.clear();
  useStore.setState({ tree: [], treeFiles: 0, libraryPath: null });
});

describe("reloadTree (review #20)", () => {
  it("still works after a reload that had no library to read", async () => {
    // This one never awaits, which is exactly what used to leave the guard
    // stuck and every later reload ignored.
    await reloadTree();
    expect(useStore.getState().tree).toEqual([]);

    rust.folders.set("C:\\lib", ["a.md", "b.md"]);
    useStore.getState().setLibraryPath("C:\\lib");
    await reloadTree();

    expect(useStore.getState().tree.map((n) => n.name)).toEqual(["a.md", "b.md"]);
    expect(useStore.getState().treeFiles).toBe(2);
  });

  it("reads again when the library changes mid-read, and keeps the newer one", async () => {
    rust.folders.set("C:\\one", ["one.md"]);
    rust.folders.set("C:\\two", ["two.md"]);

    useStore.getState().setLibraryPath("C:\\one");
    const first = reloadTree();
    // While that read is in flight the user opens another folder.
    useStore.getState().setLibraryPath("C:\\two");
    const second = reloadTree();
    await Promise.all([first, second]);

    expect(rust.reads.map((r) => r.root)).toEqual(["C:\\one", "C:\\two"]);
    expect(useStore.getState().tree.map((n) => n.name)).toEqual(["two.md"]);
  });

  it("leaves the tree alone when the read fails", async () => {
    rust.folders.set("C:\\lib", ["a.md"]);
    useStore.getState().setLibraryPath("C:\\lib");
    await reloadTree();

    const core = await import("@tauri-apps/api/core");
    const spy = vi.spyOn(core, "invoke").mockRejectedValue("nope");
    await reloadTree();
    expect(useStore.getState().tree.map((n) => n.name)).toEqual(["a.md"]);
    expect(useStore.getState().message).toContain("couldn't read");
    spy.mockRestore();

    // And a failure does not stop the next one from being attempted.
    rust.folders.set("C:\\lib", ["a.md", "c.md"]);
    await reloadTree();
    expect(useStore.getState().tree.map((n) => n.name)).toEqual(["a.md", "c.md"]);
  });
});
