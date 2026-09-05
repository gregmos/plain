// What the tree's context menu does (spec §6, §12). Every one of these ends
// with the tree reloading, so the rail never shows a file that is gone.

import { invoke } from "@tauri-apps/api/core";
import { renameBuffer } from "../editor";
import { closeDocs } from "../app/close";
import { openPaths } from "../app/commands";
import { inTauri } from "../app/env";
import { fsError, trashPath } from "../app/fs";
import { basename, dirname, pathKey } from "../app/paths";
import { useStore, type TreeNode } from "../app/store";
import { nameError, uniqueName, withExtension } from "./names";
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

/** `new file`: an empty file that never lands on top of one (spec §6). */
export async function createFile(parent: string, typed: string): Promise<void> {
  const store = useStore.getState();
  const problem = nameError(typed);
  if (problem) {
    store.setMessage(problem);
    return;
  }
  const extension = store.settings.library.extensions[0] ?? ".md";
  const wanted = withExtension(typed.trim(), extension);
  const path = await createUnique(parent, wanted, "create_file", "create the file");
  if (!path) return;

  await reloadTree();
  if (await openPaths([path])) useStore.getState().setMode("edit");
  useStore.getState().setTreeSelected(path);
}

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
