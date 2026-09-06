// What the tree's context menu does (spec §6, §12). Every one of these ends
// with the tree reloading, so the rail never shows a file that is gone.

import { invoke } from "@tauri-apps/api/core";
import { renameBuffer } from "../editor";
import { closeDocs } from "../app/close";
import { openPaths } from "../app/commands";
import { inTauri } from "../app/env";
import { fsError, trashPath } from "../app/fs";
import { migrateDocument } from "../app/history";
import { basename, dirname, pathKey } from "../app/paths";
import { useStore, type TreeNode } from "../app/store";
import { nameError, uniqueName } from "./names";
import { joinPath, nodeAt, reloadTree } from "./tree";

/** How many names to try before giving up; a folder is not an adversary. */
const TRIES = 50;

/** The names already used in that folder, so a new one can dodge them. */
export function siblings(parent: string): string[] {
  const state = useStore.getState();
  if (state.libraryPath && pathKey(state.libraryPath) === pathKey(parent)) {
    return state.tree.map((node) => node.name);
  }
  const node = nodeAt(state.tree, parent);
  return node?.children.map((child) => child.name) ?? [];
}

/** The name the inline field starts with: `Untitled.md`, `Untitled 2.md`… */
export function suggestedName(parent: string, kind: "file" | "folder"): string {
  const extension = useStore.getState().settings.library.extensions[0] ?? ".md";
  const wanted = kind === "file" ? `Untitled${extension}` : "New folder";
  return uniqueName(wanted, siblings(parent));
}

function complain(error: unknown, what: string): void {
  useStore.getState().setMessage(`couldn't ${what} — ${fsError(error).message}`);
}

/** What Rust answers when a name is taken; anything else is a real failure. */
function isTaken(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { kind?: string }).kind === "exists"
  );
}

/**
 * Creates the thing under the first name nobody has. The tree cannot be the
 * judge of that — it goes stale, and it hides extensions the settings do not
 * list — so Rust refuses to overwrite and we simply try the next name
 * (review #4). Returns the path, or null when it did not happen.
 */
async function createUnique(
  parent: string,
  wanted: string,
  command: "create_file" | "create_dir",
  what: string,
): Promise<string | null> {
  const taken = new Set(siblings(parent));
  for (let attempt = 0; attempt < TRIES; attempt += 1) {
    const name = uniqueName(wanted, taken);
    const path = joinPath(parent, name);
    try {
      await invoke(command, { path });
      return path;
    } catch (error) {
      if (!isTaken(error)) {
        complain(error, what);
        return null;
      }
      taken.add(name);
    }
  }
  useStore.getState().setMessage(`couldn't ${what} — no free name`);
  return null;
}

/**
 * Unfolds the folder a new row went into, and every folder above it. A row
 * inside a folded branch is not in `flatten`'s answer at all, so the rename
 * field would be waiting on a row that is not on screen (review #5).
 */
export function revealFolder(parent: string): void {
  const store = useStore.getState();
  const root = store.libraryPath;
  if (!root) return;

  // Both paths come from the same walk — the root the tree was read from,
  // and a folder inside it — so comparing them as text is safe here in a way
  // it is not for a document path the file system has canonicalized.
  const base = pathKey(root);
  const own = pathKey(parent);
  if (own === base || !own.startsWith(`${base}/`)) return;

  const parts = own.slice(base.length + 1).split("/");
  const chain = new Set<string>();
  for (let depth = 1; depth <= parts.length; depth += 1) {
    chain.add(parts.slice(0, depth).join("/"));
  }
  const collapsed = store.collapsed.filter((rel) => !chain.has(rel.toLowerCase()));
  if (collapsed.length !== store.collapsed.length) store.setCollapsed(collapsed);
}

/**
 * `new file` (spec §6). The file exists and is open before anything is
 * typed: `Untitled.md` is made straight away, opened in edit with the caret
 * in the empty text, and the tree puts its name in the rename field so a
 * name can be given without the document waiting for one.
 *
 * Returns the path, so a caller can tell it happened.
 */
export async function newFile(parent: string): Promise<string | null> {
  const store = useStore.getState();
  const extension = store.settings.library.extensions[0] ?? ".md";
  const path = await createUnique(
    parent,
    `Untitled${extension}`,
    "create_file",
    "create the file",
  );
  if (!path) return null;

  await reloadTree();
  if (!(await openPaths([path]))) return null;
  useStore.getState().setMode("edit");
  useStore.getState().setTreeSelected(path);
  // The row has to be on screen before the field can sit on it.
  revealFolder(parent);

  // The editor takes focus as it mounts, so the field asks for it in a later
  // task; asking in the same commit would lose the race to the editor.
  await new Promise((resolve) => setTimeout(resolve, 0));
  useStore.getState().setTreeRenaming(path);
  return path;
}

/** `new folder`: still named before it is made — there is nothing to open. */
export async function createFolder(parent: string, typed: string): Promise<void> {
  const problem = nameError(typed);
  if (problem) {
    useStore.getState().setMessage(problem);
    return;
  }
  const path = await createUnique(parent, typed.trim(), "create_dir", "create the folder");
  if (!path) return;

  await reloadTree();
  useStore.getState().setTreeSelected(path);
}

/**
 * `rename` — the file on disk only; links to it are not touched (spec §6).
 * An open document follows its file, buffer and all.
 */
export async function renameEntry(from: string, typed: string): Promise<void> {
  const problem = nameError(typed);
  if (problem) {
    useStore.getState().setMessage(problem);
    return;
  }
  const name = typed.trim();
  if (name === basename(from)) return;
  const to = joinPath(dirname(from), name);
  try {
    await invoke("rename_path", { from, to });
    // The recovery draft and the version history are filed under the path,
    // so they move with it (review w10 #2). Before the document changes id,
    // so a draft written straight after lands on the new name.
    await migrateDocument(from, to);
    const open = useStore.getState().docs.find((d) => d.path && pathKey(d.path) === pathKey(from));
    if (open) {
      const next = pathKey(to);
      renameBuffer(open.id, next);
      useStore.getState().renameDoc(open.id, to);
    }
    await reloadTree();
    useStore.getState().setTreeSelected(to);
  } catch (error) {
    complain(error, "rename");
  }
}

/** Every open document that lives at this path or under it. */
function openUnder(path: string): string[] {
  const key = pathKey(path);
  return useStore
    .getState()
    .docs.filter((doc) => {
      if (!doc.path) return false;
      const own = pathKey(doc.path);
      return own === key || own.startsWith(`${key}/`);
    })
    .map((doc) => doc.id);
}

/** `delete` — the Recycle Bin, after one question (spec §6). */
export function askDelete(node: Pick<TreeNode, "name" | "path" | "dir">): void {
  const store = useStore.getState();
  store.setDialog({
    title: `move ${node.name} to the recycle bin?`,
    lines: node.dir ? [`${node.path} and everything in it.`] : [node.path],
    actions: [
      {
        label: "move to recycle bin",
        run: () => {
          store.setDialog(null);
          remove(node.path);
        },
      },
      { label: "cancel", run: () => store.setDialog(null) },
    ],
    cancel: () => store.setDialog(null),
  });
}

/**
 * The buffers go first, through the same one question `Ctrl+W` asks. Only
 * what is on disk goes to the Recycle Bin, so unsaved text that never got
 * there must not be dropped without a word (review #5). `cancel` in that
 * dialog stops the delete too — `closeDocs` simply never calls back.
 */
function remove(path: string): void {
  closeDocs(openUnder(path), () => void trashNow(path));
}

async function trashNow(path: string): Promise<void> {
  try {
    if (inTauri) await trashPath(path);
  } catch (error) {
    complain(error, "delete");
    return;
  }
  const store = useStore.getState();
  if (pathKey(store.treeSelected ?? "") === pathKey(path)) store.setTreeSelected(null);
  await reloadTree();
  store.setMessage("moved to the recycle bin");
}
