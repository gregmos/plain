import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TreeNode } from "../app/store";

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

/** Which paths were opened, in order: the sequence is what is under test. */
const opened: string[] = [];
vi.mock("../app/commands", () => ({
  openPaths: async (paths: string[]) => {
    opened.push(...paths);
    return true;
  },
}));

const dirtyIds = new Set<string>();

const { askDelete, newFile, renameEntry } = await import("./ops");
const { makeDoc, useStore } = await import("../app/store");

const ROOT = "C:\\lib";

/** One row of the tree, addressed the way the store addresses it. */
function file(rel: string): TreeNode {
  return {
    name: rel.slice(rel.lastIndexOf("/") + 1),
    path: `${ROOT}\\${rel.split("/").join("\\")}`,
    rel,
    dir: false,
    unreadable: false,
    mtimeMs: 0,
    ctimeMs: 0,
    children: [],
  };
}

function folder(rel: string, children: TreeNode[]): TreeNode {
  return { ...file(rel), dir: true, children };
}

function tree(names: string[]) {
  return names.map((name) => file(name));
}

beforeEach(() => {
  rust.calls.length = 0;
  rust.onDisk.clear();
  dirtyIds.clear();
  opened.length = 0;
  useStore.setState({
    docs: [],
    activeId: null,
    dialog: null,
    message: null,
    treeSelected: null,
    treeRenaming: null,
  });
  useStore.getState().setLibraryPath(ROOT);
  useStore.getState().setTree(tree(["a.md"]));
});

const created = () => rust.calls.filter((c) => c.cmd === "create_file").map((c) => c.args["path"]);
const renamed = () => rust.calls.filter((c) => c.cmd === "rename_path");

describe("new file (spec §6)", () => {
  it("makes the file, opens it, and only then asks for a name", async () => {
    const path = await newFile(ROOT);

    // The order is the whole point: nothing waits for a name to be typed.
    expect(path).toBe(`${ROOT}\\Untitled.md`);
    expect(created()).toEqual([`${ROOT}\\Untitled.md`]);
    expect(opened).toEqual([`${ROOT}\\Untitled.md`]);

    const state = useStore.getState();
    expect(state.treeSelected).toBe(`${ROOT}\\Untitled.md`);
    // And the tree is holding the rename field open over it.
    expect(state.treeRenaming).toBe(`${ROOT}\\Untitled.md`);
  });

  it("makes it in the folder it was asked for", async () => {
    expect(await newFile(`${ROOT}\\notes`)).toBe(`${ROOT}\\notes\\Untitled.md`);
  });

  it("steps aside for a name the tree never showed", async () => {
    // Rust is the only judge of what is on disk: the tree goes stale and it
    // hides extensions the settings do not list. Nothing may be overwritten.
    rust.onDisk.add(`${ROOT}\\Untitled.md`);
    await newFile(ROOT);
    expect(created()).toEqual([`${ROOT}\\Untitled.md`, `${ROOT}\\Untitled 2.md`]);
    expect(opened).toEqual([`${ROOT}\\Untitled 2.md`]);
  });

  it("keeps stepping until it finds a free name", async () => {
    rust.onDisk.add(`${ROOT}\\Untitled.md`);
    rust.onDisk.add(`${ROOT}\\Untitled 2.md`);
    rust.onDisk.add(`${ROOT}\\Untitled 3.md`);
    await newFile(ROOT);
    expect(created()).toEqual([
      `${ROOT}\\Untitled.md`,
      `${ROOT}\\Untitled 2.md`,
      `${ROOT}\\Untitled 3.md`,
      `${ROOT}\\Untitled 4.md`,
    ]);
  });

  it("opens nothing and asks nothing when the file could not be made", async () => {
    const invoke = await import("@tauri-apps/api/core");
    const spy = vi.spyOn(invoke, "invoke").mockRejectedValue({ kind: "io", message: "disk full" });

    expect(await newFile(ROOT)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(opened).toEqual([]);
    expect(useStore.getState().treeRenaming).toBeNull();
    expect(useStore.getState().message).toContain("disk full");
    spy.mockRestore();
  });
});

describe("a new file inside a folded folder (review #5)", () => {
  // `work/specs` holds a note; both folders start folded shut.
  const nested = () => [
    folder("work", [folder("work/specs", [file("work/specs/api.md")])]),
    file("a.md"),
  ];

  beforeEach(() => {
    useStore.getState().setTree(nested());
    useStore.getState().setCollapsed(["work", "work/specs"]);
  });

  it("unfolds the folder and everything above it, so the row is on screen", async () => {
    await newFile(`${ROOT}\\work\\specs`);
    // Neither branch may stay shut: `flatten` would not return the row at
    // all, and the rename field would be waiting on something invisible.
    expect(useStore.getState().collapsed).toEqual([]);
    expect(useStore.getState().treeRenaming).toBe(`${ROOT}\\work\\specs\\Untitled.md`);
  });

  it("leaves folders that are not on the way alone", async () => {
    useStore.getState().setCollapsed(["work", "work/specs", "elsewhere"]);
    await newFile(`${ROOT}\\work`);
    expect(useStore.getState().collapsed).toEqual(["work/specs", "elsewhere"]);
  });

  it("has nothing to unfold for the library root", async () => {
    await newFile(ROOT);
    expect(useStore.getState().collapsed).toEqual(["work", "work/specs"]);
    expect(useStore.getState().treeRenaming).toBe(`${ROOT}\\Untitled.md`);
  });
});

describe("naming the file that was just made (spec §6)", () => {
  /** What the tree does on `Enter`, and what it does on `Esc`. */
  const enter = async (from: string, typed: string) => {
    useStore.getState().setTreeRenaming(null);
    await renameEntry(from, typed);
  };
  const escape = () => useStore.getState().setTreeRenaming(null);

  it("renames the file on Enter and closes the field", async () => {
    const path = (await newFile(ROOT)) as string;
    rust.calls.length = 0;

    await enter(path, "ideas.md");
    expect(renamed()).toHaveLength(1);
    expect(renamed()[0]?.args).toMatchObject({ from: path, to: `${ROOT}\\ideas.md` });
    expect(useStore.getState().treeRenaming).toBeNull();
  });

  it("keeps Untitled.md on Esc and renames nothing", async () => {
    const path = (await newFile(ROOT)) as string;
    rust.calls.length = 0;

    escape();
    expect(renamed()).toEqual([]);
    expect(useStore.getState().treeRenaming).toBeNull();
    // The document that was opened is still the one that is open.
    expect(opened).toEqual([path]);
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
