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

/**
 * `running` is a flag and not the promise itself on purpose: a read with no
 * library to read finishes without ever awaiting, so the promise variable
 * would be assigned after its own `finally` had already cleared it, and every
 * later reload would be turned away by a read that had long since ended.
 */
let running = false;
let pending: Promise<void> = Promise.resolve();
/** Something changed while a read was in flight; go round once more (#20). */
let again = false;

/**
 * Reads the tree again. A read that is already running is not reused — the
 * library may have changed since it started — it is asked to repeat with
 * whatever the parameters are by then. Failures leave the old tree alone.
 */
export function reloadTree(): Promise<void> {
  if (running) {
    again = true;
    return pending;
  }
  running = true;
  pending = (async () => {
    try {
      do {
        again = false;
        const store = useStore.getState();
        const root = store.libraryPath;
        if (!root || !inTauri) {
          store.setTree([]);
          continue;
        }
        try {
          const tree = await readTree(root, store.settings.library.extensions);
          // The library may have changed under the await; if it did, the
          // answer is about a folder nobody is looking at any more.
          if (useStore.getState().libraryPath === root) useStore.getState().setTree(tree);
          else again = true;
        } catch {
          useStore.getState().setMessage("couldn't read the library folder");
        }
      } while (again);
    } finally {
      running = false;
      again = false;
    }
  })();
  return pending;
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
