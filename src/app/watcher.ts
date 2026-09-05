// External changes (spec §8). Rust reports raw paths; only this side knows
// the hash a buffer came from, so the whole decision lives here.

import { listen } from "@tauri-apps/api/event";
import { flushActiveEditor } from "../editor";
import { isDirty } from "../editor/buffers";
import { inTauri } from "./env";
import { fsError, hashFile, watchPaths } from "./fs";
import { pathKey } from "./paths";
import { reloadFromDisk, showConflict } from "./save";
import { useStore } from "./store";

/** Wave 5 hangs the file tree off this. */
export const TREE_CHANGED = "plain:tree-changed";

const checking = new Set<string>();

/**
 * Same hash as the last write of ours -> our own change, ignore it.
 * Different and the buffer is clean -> reload quietly. Different with edits
 * -> the conflict banner, which is the only thing that may lose work.
 */
export async function checkDoc(id: string): Promise<void> {
  if (checking.has(id)) return;
  checking.add(id);
  try {
    const store = useStore.getState();
    const before = store.docs.find((d) => d.id === id);
    if (!before?.path) return;

    let hash: string | null;
    try {
      hash = await hashFile(before.path);
    } catch (error) {
      // Access denied or a network hiccup is not a deletion (spec §8).
      store.setMessage(`couldn't check ${before.title} — ${fsError(error).message}`);
      return;
    }

    // The document may have moved on while the hash was being read.
    const doc = useStore.getState().docs.find((d) => d.id === id);
    if (!doc?.path) return;
    if (hash === null) {
      if (!doc.deleted) store.updateDoc(id, { deleted: true });
      return;
    }
    if (doc.deleted) store.updateDoc(id, { deleted: false });
    if (hash === doc.baseHash) return;
    // The live buffer decides, not the store's copy of it; and reloading
    // checks again right before it swaps the text.
    flushActiveEditor();
    const live = useStore.getState().docs.find((d) => d.id === id);
    if (live && isDirty(id, live.text)) {
      showConflict(id);
      return;
    }
    await reloadFromDisk(id);
  } finally {
    checking.delete(id);
  }
}

async function onChange(paths: string[]): Promise<void> {
  let tree = false;
  for (const path of paths) {
    const key = pathKey(path);
    const doc = useStore.getState().docs.find((d) => d.path && pathKey(d.path) === key);
    if (doc) await checkDoc(doc.id);
    else tree = true;
  }
  if (tree) window.dispatchEvent(new CustomEvent(TREE_CHANGED));
}

/** One watcher; changing the library or opening a file restarts it. */
let armed = "";

function arm(): void {
  const state = useStore.getState();
  const files = state.docs.map((d) => d.path).filter((p): p is string => p !== null);
  const key = `${state.libraryPath ?? ""}|${files.join("|")}`;
  if (key === armed) return;
  armed = key;
  void watchPaths(state.libraryPath, files).catch(() => undefined);
}

export function installWatcher(): () => void {
  if (!inTauri) return () => undefined;

  const unsubscribe = useStore.subscribe((state, previous) => {
    if (state.docs !== previous.docs || state.libraryPath !== previous.libraryPath) arm();
  });
  arm();

  const unlisten = listen<{ paths: string[] }>("fs-change", (event) => {
    void onChange(event.payload.paths ?? []);
  });

  // A file changed while Plain was in the background often produces no event
  // at all on network folders, so coming back also checks (spec §8).
  const onFocus = () => {
    const { activeId } = useStore.getState();
    if (activeId) void checkDoc(activeId);
  };
  window.addEventListener("focus", onFocus);

  return () => {
    unsubscribe();
    void unlisten.then((off) => off());
    window.removeEventListener("focus", onFocus);
    // A remount (React strict mode, a hot reload) has to arm it again.
    armed = "";
  };
}
