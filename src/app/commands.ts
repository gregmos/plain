// Everything a shortcut, a menu or a link can trigger. Wave 1 covers the
// window and opening files; saving arrives in wave 4.

import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./env";
import { basename, pathKey } from "./paths";
import { useStore } from "./store";

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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
      openDoc(path, await readTextFile(path));
      opened = true;
    } catch (error) {
      showBanner({
        id: "open-failed",
        text: `couldn't open ${basename(path)} — ${reason(error)}`,
        actions: [{ label: "dismiss", run: () => useStore.getState().dismissBanner("open-failed") }],
      });
    }
  }
  return opened;
}

/**
 * Takes whatever Rust parked for us — launch arguments, or the argv of a
 * second launch. Opening a file this way collapses the rail (spec §6).
 */
export async function drainPendingPaths(): Promise<void> {
  if (!inTauri) return;
  const paths = await invoke<string[]>("take_pending_paths");
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

export function closeActive(): void {
  const { activeId, closeDoc } = useStore.getState();
  if (activeId) closeDoc(activeId);
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
