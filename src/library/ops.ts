// What the tree's context menu does (spec §6, §12). Every one of these ends
// with the tree reloading, so the rail never shows a file that is gone.

import { invoke } from "@tauri-apps/api/core";
import { dropBuffer, renameBuffer } from "../editor";
import { openPaths } from "../app/commands";
import { dropDraft } from "../app/drafts";
import { inTauri } from "../app/env";
import { fsError, trashPath, writeFileAtomic } from "../app/fs";
import { basename, dirname, pathKey } from "../app/paths";
import { useStore, type TreeNode } from "../app/store";
import { nameError, uniqueName, withExtension } from "./names";
import { joinPath, nodeAt, reloadTree } from "./tree";

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

/**
 * `new file`: an empty file, written the same atomic way as any save, then
 * opened in edit (spec §6).
 */
export async function createFile(parent: string, typed: string): Promise<void> {
  const store = useStore.getState();
  const problem = nameError(typed);
  if (problem) {
    store.setMessage(problem);
    return;
  }
  const extension = store.settings.library.extensions[0] ?? ".md";
  const name = uniqueName(withExtension(typed.trim(), extension), siblings(parent));
  const path = joinPath(parent, name);
  try {
    await writeFileAtomic({
      path,
      text: "",
      encoding: "utf-8",
      bom: false,
      eol: store.settings.files.newFileEol,
      baseHash: null,
      allowMissing: true,
    });
    await reloadTree();
    if (await openPaths([path])) useStore.getState().setMode("edit");
    useStore.getState().setTreeSelected(path);
  } catch (error) {
    complain(error, "create the file");
  }
}

export async function createFolder(parent: string, typed: string): Promise<void> {
  const problem = nameError(typed);
  if (problem) {
    useStore.getState().setMessage(problem);
    return;
  }
  const name = uniqueName(typed.trim(), siblings(parent));
  const path = joinPath(parent, name);
  try {
    await invoke("create_dir", { path });
    await reloadTree();
    useStore.getState().setTreeSelected(path);
  } catch (error) {
    complain(error, "create the folder");
  }
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

/** Everything the tree knows about is either a file or a folder of them. */
function openUnder(path: string): { id: string; path: string | null }[] {
  const key = pathKey(path);
  return useStore
    .getState()
    .docs.filter((doc) => {
      if (!doc.path) return false;
      const own = pathKey(doc.path);
      return own === key || own.startsWith(`${key}/`);
    })
    .map((doc) => ({ id: doc.id, path: doc.path }));
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
          void remove(node.path);
        },
      },
      { label: "cancel", run: () => store.setDialog(null) },
    ],
    cancel: () => store.setDialog(null),
  });
}

async function remove(path: string): Promise<void> {
  const affected = openUnder(path);
  try {
    if (inTauri) await trashPath(path);
  } catch (error) {
    complain(error, "delete");
    return;
  }
  // The file is gone on purpose, so its buffer and its draft go with it.
  const store = useStore.getState();
  for (const doc of affected) {
    void dropDraft(doc);
    store.closeDoc(doc.id);
    dropBuffer(doc.id);
  }
  if (pathKey(store.treeSelected ?? "") === pathKey(path)) store.setTreeSelected(null);
  await reloadTree();
  store.setMessage("moved to the recycle bin");
}
