// Everything a shortcut, a menu or a link can trigger. Saving lives in
// save.ts and closing in close.ts; the rest is here.

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isDirty } from "../editor/buffers";
import { emitRerender } from "../read/events";
import { inTauri } from "./env";
import { docFields, fsError, readFile } from "./fs";
import { basename, pathKey } from "./paths";
import { reloadFromDisk } from "./save";
import { activeDoc, makeDoc, useStore } from "./store";

/**
 * Reads each path into the open list; the first one becomes active.
 * Returns whether anything ended up open.
 */
export async function openPaths(paths: string[]): Promise<boolean> {
  const { activate, openDoc, showBanner } = useStore.getState();
  let opened = false;

  for (const path of paths) {
    // Already open under another spelling of the same path: just show it,
    // and do not read the file a second time.
    const existing = useStore.getState().docs.find((d) => d.id === pathKey(path));
    if (existing) {
      activate(existing.id);
      opened = true;
      continue;
    }
    try {
      openDoc(makeDoc({ id: pathKey(path), path, ...docFields(await readFile(path)) }));
      opened = true;
    } catch (error) {
      showBanner({
        id: "open-failed",
        text: `couldn't open ${basename(path)} — ${fsError(error).message}`,
        actions: [{ label: "dismiss", run: () => useStore.getState().dismissBanner("open-failed") }],
      });
    }
  }
  return opened;
}

/**
 * `Ctrl+N`. Without a library this is a nameless buffer whose `Ctrl+S` is
 * Save As (spec §6); inside a library the tree will name it in wave 5, so
 * for now it is the same buffer with the library as the default folder.
 */
let untitled = 0;

export function newDoc(): void {
  const store = useStore.getState();
  untitled += 1;
  store.openDoc(
    makeDoc({
      id: `untitled-${untitled}`,
      path: null,
      text: "",
      mode: "edit",
      eol: store.settings.files.newFileEol,
    }),
  );
}

/** `F5`: build the document again, and re-read it when it is clean. */
export function refresh(): void {
  const doc = activeDoc(useStore.getState());
  if (!doc?.path) {
    emitRerender();
    return;
  }
  if (isDirty(doc.id, doc.text)) {
    useStore.getState().setMessage("unsaved changes — save or reload from banner");
    emitRerender();
    return;
  }
  void reloadFromDisk(doc.id, "").then(emitRerender);
}

/**
 * Takes whatever Rust parked for us — launch arguments, or the argv of a
 * second launch. Opening a file this way collapses the rail (spec §6).
 */
export async function pendingPaths(): Promise<string[]> {
  return inTauri ? invoke<string[]>("take_pending_paths") : [];
}

export async function drainPendingPaths(): Promise<void> {
  const paths = await pendingPaths();
  if (paths.length === 0) return;
  if (await openPaths(paths)) useStore.getState().setRailCollapsed(true);
}

export async function openFile(): Promise<void> {
  if (!inTauri) return;
  const extensions = useStore
    .getState()
    .settings.library.extensions.map((e) => e.replace(/^\./, ""));
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "markdown", extensions }],
  });
  if (typeof picked === "string") await openPaths([picked]);
}

export async function openLibrary(): Promise<void> {
  if (!inTauri) return;
  // recursive: the fs scope has to reach files in sub-folders, not just the root.
  const picked = await open({ directory: true, multiple: false, recursive: true });
  if (typeof picked !== "string") return;
  const store = useStore.getState();
  store.setLibraryPath(picked);
  store.setRailView("files");
  store.setRailCollapsed(false);
  store.setMessage(`library · ${basename(picked)}`);
}

export async function toggleFullscreen(): Promise<void> {
  if (!inTauri) return;
  const win = getCurrentWindow();
  await win.setFullscreen(!(await win.isFullscreen()));
}

export async function toggleAlwaysOnTop(): Promise<void> {
  const store = useStore.getState();
  const next = !store.alwaysOnTop;
  if (inTauri) await getCurrentWindow().setAlwaysOnTop(next);
  store.setAlwaysOnTop(next);
  store.setMessage(next ? "always on top" : "always on top off");
}

/**
 * Same as `openPaths`, but the document that was active stays active — this
 * is what `Ctrl+click` on a link in read does (spec §5.1).
 */
export async function openPathsInBackground(paths: string[]): Promise<boolean> {
  const before = useStore.getState().activeId;
  const opened = await openPaths(paths);
  if (before) useStore.getState().activate(before);
  return opened;
}
