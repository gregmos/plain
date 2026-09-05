// Tags of the library (spec §2a). Rust walks the folder once and counts; the
// front end only decides when to ask again. No index, no watching per file.

import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../app/env";
import { useStore, type TagCount } from "../app/store";
import { TREE_CHANGED } from "../app/watcher";

/** A burst of file writes is one recount, and it is not urgent (spec §2a). */
const DEBOUNCE_MS = 2000;

export function collectTags(root: string, extensions: string[]): Promise<TagCount[]> {
  return invoke<TagCount[]>("collect_tags", { root, extensions });
}

let running = false;
let again = false;

/** Reads the tags again; a failure leaves the ones we had. */
export function reloadTags(): Promise<void> {
  if (running) {
    again = true;
    return Promise.resolve();
  }
  running = true;
  return (async () => {
    try {
      do {
        again = false;
        const store = useStore.getState();
        const root = store.libraryPath;
        if (!root || !inTauri) {
          store.setTags([]);
          continue;
        }
        try {
          const tags = await collectTags(root, store.settings.library.extensions);
          if (useStore.getState().libraryPath === root) useStore.getState().setTags(tags);
          else again = true;
        } catch {
          /* the rail keeps the tags it has; a folder that will not read is
             already reported by the tree */
        }
      } while (again);
    } finally {
      running = false;
      again = false;
    }
  })();
}

/** The files a tag is in, for the library filter. */
export function filesOf(tags: TagCount[], tag: string | null): string[] | null {
  if (!tag) return null;
  return tags.find((entry) => entry.tag === tag)?.files ?? [];
}

export function installTags(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void reloadTags(), DEBOUNCE_MS);
  };

  const unsubscribe = useStore.subscribe((state, previous) => {
    if (
      state.libraryPath !== previous.libraryPath ||
      state.settings.library.extensions !== previous.settings.library.extensions
    ) {
      void reloadTags();
    }
  });

  window.addEventListener(TREE_CHANGED, later);
  void reloadTags();

  return () => {
    clearTimeout(timer);
    unsubscribe();
    window.removeEventListener(TREE_CHANGED, later);
  };
}
