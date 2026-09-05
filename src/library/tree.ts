// The library tree (spec §6). Rust reads and sorts the folder; this side
// only decides what is on screen, and reloads when the watcher says the
// folder changed.

import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../app/env";
import { useStore, type TreeNode } from "../app/store";
import { TREE_CHANGED } from "../app/watcher";

/** A tree change is often a burst of events; one reload is enough. */
const RELOAD_MS = 300;

/** One row of the rendered tree; folders carry a header, files a name. */
export interface Row {
  node: TreeNode;
  /** 0 at the root of the library. */
  depth: number;
  collapsed: boolean;
}

/**
 * Depth-first, skipping what is folded shut. Folders come first because Rust
 * sorted them that way (spec §6); nothing is re-ordered here.
 */
export function flatten(nodes: TreeNode[], collapsed: Set<string>, depth = 0): Row[] {
  const rows: Row[] = [];
  for (const node of nodes) {
    const shut = node.dir && collapsed.has(node.rel);
    rows.push({ node, depth, collapsed: shut });
    if (node.dir && !shut) rows.push(...flatten(node.children, collapsed, depth + 1));
  }
  return rows;
}

/** Every file in the tree, deepest last — what quick search searches. */
export function files(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const node of list) {
      if (node.dir) walk(node.children);
      else out.push(node);
    }
  };
  walk(nodes);
  return out;
}

/** Finds a node by its absolute path; used to keep the selection alive. */
export function nodeAt(nodes: TreeNode[], path: string): TreeNode | null {
  const key = path.toLowerCase();
  const walk = (list: TreeNode[]): TreeNode | null => {
    for (const node of list) {
      if (node.path.toLowerCase() === key) return node;
      const found = node.dir ? walk(node.children) : null;
      if (found) return found;
    }
    return null;
  };
  return walk(nodes);
}

/** Windows spelling, and it keeps whatever separator the parent used. */
export function joinPath(parent: string, name: string): string {
  const separator = parent.includes("\\") || !parent.includes("/") ? "\\" : "/";
  return `${parent.replace(/[\\/]+$/, "")}${separator}${name}`;
}

export async function readTree(root: string, extensions: string[]): Promise<TreeNode[]> {
  return invoke<TreeNode[]>("read_tree", { root, extensions });
}

/** `file`, `dir` or `missing` — what a dropped path turned out to be. */
export async function pathKind(path: string): Promise<string> {
  if (!inTauri) return "missing";
  return invoke<string>("path_kind", { path });
}

let loading: Promise<void> | null = null;

/** Reads the tree again. Failures leave the previous tree alone. */
export async function reloadTree(): Promise<void> {
  if (loading) return loading;
  const store = useStore.getState();
  const root = store.libraryPath;
  if (!root || !inTauri) {
    store.setTree([]);
    return;
  }
  loading = (async () => {
    try {
      const tree = await readTree(root, store.settings.library.extensions);
      // The library may have changed under the await.
      if (useStore.getState().libraryPath === root) useStore.getState().setTree(tree);
    } catch {
      useStore.getState().setMessage("couldn't read the library folder");
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/**
 * Keeps the tree in step with the library and with the disk. The watcher is
 * already running over the library root (spec §6); this only listens.
 */
export function installTree(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void reloadTree(), RELOAD_MS);
  };

  const unsubscribe = useStore.subscribe((state, previous) => {
    if (
      state.libraryPath !== previous.libraryPath ||
      state.settings.library.extensions !== previous.settings.library.extensions
    ) {
      void reloadTree();
    }
  });

  window.addEventListener(TREE_CHANGED, later);
  void reloadTree();

  return () => {
    clearTimeout(timer);
    unsubscribe();
    window.removeEventListener(TREE_CHANGED, later);
  };
}
