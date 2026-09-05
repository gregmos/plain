// `links here` (spec §2a): the files of the library that point at the open
// one. Rust does the walking; this decides when to ask and remembers the
// answer for as long as the folder has not changed.

import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../app/env";
import { pathKey } from "../app/paths";
import { activeDoc, useStore, type Backlink } from "../app/store";
import { TREE_CHANGED } from "../app/watcher";

/** Switching documents quickly should not start a walk for each of them. */
const DEBOUNCE_MS = 300;

export function fetchBacklinks(
  root: string,
  extensions: string[],
  path: string,
): Promise<Backlink[]> {
  return invoke<Backlink[]>("backlinks", { root, extensions, path });
}

/** Answers for this session, thrown away whenever the folder changes. */
const cache = new Map<string, Backlink[]>();

export function clearBacklinks(): void {
  cache.clear();
}

let asked = 0;

/** Looks up the active document, or empties the section when there is none. */
export async function reloadBacklinks(): Promise<void> {
  const store = useStore.getState();
  const doc = activeDoc(store);
  const root = store.libraryPath;
  asked += 1;
  const mine = asked;

  if (!root || !doc?.path || !inTauri) {
    store.setBacklinks([]);
    return;
  }

  // Rust decides whether the document is inside the library and what its
  // path there is: it can canonicalize, and a string comparison here cannot.
  const key = pathKey(doc.path);
  const known = cache.get(key);
  if (known) {
    store.setBacklinks(known);
    return;
  }

  try {
    const found = await fetchBacklinks(root, store.settings.library.extensions, doc.path);
    cache.set(key, found);
    // Another document became active while the walk was running.
    if (mine === asked) useStore.getState().setBacklinks(found);
  } catch {
    if (mine === asked) useStore.getState().setBacklinks([]);
  }
}

export function installBacklinks(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void reloadBacklinks(), DEBOUNCE_MS);
  };

  const unsubscribe = useStore.subscribe((state, previous) => {
    const path = activeDoc(state)?.path ?? null;
    const before = activeDoc(previous)?.path ?? null;
    if (path !== before || state.libraryPath !== previous.libraryPath) later();
  });

  // A file that gained a link to us is a different answer.
  const onTree = () => {
    clearBacklinks();
    later();
  };
  window.addEventListener(TREE_CHANGED, onTree);
  later();

  return () => {
    clearTimeout(timer);
    unsubscribe();
    window.removeEventListener(TREE_CHANGED, onTree);
  };
}
