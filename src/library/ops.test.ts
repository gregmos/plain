import { beforeEach, describe, expect, it, vi } from "vitest";

const rust = vi.hoisted(() => ({
  calls: [] as { cmd: string; args: Record<string, unknown> }[],
  /** Paths Rust pretends already exist, whatever the tree believes. */
  onDisk: new Set<string>(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args: Record<string, unknown>) => {
    rust.calls.push({ cmd, args });
    const path = String(args["path"] ?? "");
    if ((cmd === "create_file" || cmd === "create_dir") && rust.onDisk.has(path)) {
      // Exactly what tree.rs answers for `create_new` on a taken name.
      return Promise.reject({ kind: "exists", message: `${path} already exists` });
    }
    if (cmd === "create_file" || cmd === "create_dir") {
      rust.onDisk.add(path);
      return Promise.resolve(null);
    }
    return Promise.resolve(null);
  },
}));

// The editor and the file the tree would open are not the subject here.
vi.mock("../editor", () => ({
  renameBuffer: () => undefined,
  dropBuffer: () => undefined,
  flushActiveEditor: () => undefined,
  isDirty: (id: string) => dirtyIds.has(id),
  markSaved: () => undefined,
}));

vi.mock("../app/commands", () => ({ openPaths: () => Promise.resolve(false) }));

const dirtyIds = new Set<string>();

const { createFile } = await import("./ops");
const { askDelete } = await import("./ops");
const { makeDoc, useStore } = await import("../app/store");

const ROOT = "C:\\lib";

function tree(names: string[]) {
  return names.map((name) => ({
    name,
    path: `${ROOT}\\${name}`,
    rel: name,
    dir: false,
    unreadable: false,
    mtimeMs: 0,
    ctimeMs: 0,
    children: [],
  }));
}

beforeEach(() => {
  rust.calls.length = 0;
  rust.onDisk.clear();
  dirtyIds.clear();
  useStore.setState({ docs: [], activeId: null, dialog: null, message: null, treeSelected: null });
  useStore.getState().setLibraryPath(ROOT);
  useStore.getState().setTree(tree(["a.md"]));
});

const created = () => rust.calls.filter((c) => c.cmd === "create_file").map((c) => c.args["path"]);

describe("new file (review #4)", () => {
  it("takes the name when nothing is using it", async () => {
    await createFile(ROOT, "ideas");
    expect(created()).toEqual([`${ROOT}\\ideas.md`]);
  });

  it("steps aside for a file the tree never showed", async () => {
    // A `.txt` is not in library.extensions, so the tree cannot warn us —
    // only Rust's refusal can, and it must not have written anything.
    rust.onDisk.add(`${ROOT}\\notes.txt`);
    await createFile(ROOT, "notes.txt");
    expect(created()).toEqual([`${ROOT}\\notes.txt`, `${ROOT}\\notes 2.txt`]);
  });

  it("keeps stepping until it finds a free name", async () => {
    rust.onDisk.add(`${ROOT}\\notes.txt`);
    rust.onDisk.add(`${ROOT}\\notes 2.txt`);
    rust.onDisk.add(`${ROOT}\\notes 3.txt`);
    await createFile(ROOT, "notes.txt");
    expect(created()).toEqual([
      `${ROOT}\\notes.txt`,
      `${ROOT}\\notes 2.txt`,
      `${ROOT}\\notes 3.txt`,
      `${ROOT}\\notes 4.txt`,
    ]);
  });

  it("gives up on a real failure instead of trying other names", async () => {
    rust.calls.length = 0;
    const invoke = await import("@tauri-apps/api/core");
    const spy = vi.spyOn(invoke, "invoke").mockRejectedValue({ kind: "io", message: "disk full" });
    await createFile(ROOT, "ideas");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(useStore.getState().message).toContain("disk full");
    spy.mockRestore();
  });
});

describe("delete (review #5)", () => {
  const confirm = () => {
    const dialog = useStore.getState().dialog;
    dialog?.actions[0]?.run();
  };

  function open(path: string, dirty: boolean) {
    const doc = makeDoc({ id: path.toLowerCase().replace(/\\/g, "/"), path, text: "x" });
    useStore.getState().openDoc(doc);
    if (dirty) dirtyIds.add(doc.id);
  }

  it("asks about unsaved work before anything reaches the bin", () => {
    open(`${ROOT}\\a.md`, true);
    askDelete({ name: "a.md", path: `${ROOT}\\a.md`, dir: false });
    confirm();

    // The second dialog is the one `Ctrl+W` shows, not a delete of the text.
    expect(useStore.getState().dialog?.title).toContain("unsaved");
    expect(useStore.getState().docs).toHaveLength(1);
  });

  it("cancelling that question cancels the delete too", () => {
    open(`${ROOT}\\a.md`, true);
    askDelete({ name: "a.md", path: `${ROOT}\\a.md`, dir: false });
    confirm();

    const cancel = useStore.getState().dialog?.actions.at(-1);
    cancel?.run();
    expect(useStore.getState().docs).toHaveLength(1);
    expect(useStore.getState().dialog).toBeNull();
  });

  it("asks once for a folder that holds several open documents", () => {
    open(`${ROOT}\\notes\\a.md`, true);
    open(`${ROOT}\\notes\\b.md`, true);
    open(`${ROOT}\\elsewhere.md`, true);
    askDelete({ name: "notes", path: `${ROOT}\\notes`, dir: true });
    confirm();

    const dialog = useStore.getState().dialog;
    expect(dialog?.title).toContain("2 files");
    expect(dialog?.lines).toEqual([`${ROOT}\\notes\\a.md`, `${ROOT}\\notes\\b.md`]);
  });

  it("goes straight through when nothing is unsaved", () => {
    open(`${ROOT}\\a.md`, false);
    askDelete({ name: "a.md", path: `${ROOT}\\a.md`, dir: false });
    confirm();

    expect(useStore.getState().dialog).toBeNull();
    expect(useStore.getState().docs).toHaveLength(0);
  });
});
