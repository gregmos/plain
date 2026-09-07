// Startup: settings, then unsaved work, then either the paths this window
// was asked to open or the session it had last time (spec §6, §8).
//
// Every window runs this. Which entry of state.json a window restores is
// settled before it starts: the first window of a run takes the first entry
// and brings the other windows back, and each of those is handed its own
// (app/windows.ts).

import { listen } from "@tauri-apps/api/event";
import { drainPendingPaths, openLibraryPath, openPaths } from "./commands";
import { listDrafts } from "./drafts";
import { inTauri } from "./env";
import { pathKey } from "./paths";
import { flushSession, loadState, readingPosition, seedReading, type SessionFile } from "./session";
import { restoreZoom } from "./zoom";
import { loadSettings } from "./settings";
import { useStore } from "./store";
import { isFirstWindow, restoreWindow, takeOpening } from "./windows";
import { emitGotoHeading } from "../read/events";

/** Held while the `unsaved work found` screen is up (spec §8). */
let afterRecovery: (() => Promise<void>) | null = null;

export function recoveryDone(): void {
  const next = afterRecovery;
  afterRecovery = null;
  useStore.getState().setRecovery(null);
  void (async () => {
    await next?.();
    fitRail();
    await flushSession();
  })();
}

async function restore(session: SessionFile): Promise<void> {
  const store = useStore.getState();
  await openPaths(session.files.map((f) => f.path));
  for (const file of session.files) {
    const id = pathKey(file.path);
    if (!useStore.getState().docs.some((d) => d.id === id)) continue;
    store.updateDoc(id, { mode: file.mode, caret: file.caret });
  }
  const active = session.active ? pathKey(session.active) : null;
  if (active && useStore.getState().docs.some((d) => d.id === active)) {
    store.activate(active);
    const heading = readingPosition(session.active as string);
    // After the read view has mounted and built the document.
    if (heading) setTimeout(() => emitGotoHeading(heading), 0);
  }
}

/**
 * The windows that were open besides this one, in the order they were made.
 * Each is handed its own entry, so it restores itself rather than being told
 * what to show once it is up.
 */
async function restoreWindows(state: SessionFile[]): Promise<void> {
  for (const session of state.slice(1)) await restoreWindow(session);
}

export async function bootstrap(): Promise<void> {
  const { settings, invalid } = await loadSettings();
  const store = useStore.getState();
  store.applySettings(settings);
  if (invalid) {
    store.showBanner({
      id: "settings",
      text: "settings.json is invalid",
      actions: [{ label: "dismiss", run: () => useStore.getState().dismissBanner("settings") }],
    });
  }

  if (!inTauri) return;

  // Listener first, then drain: a second launch can signal at any moment, and
  // the event is only a nudge to read the queue — the paths live in Rust.
  await listen("open-path", () => void drainPendingPaths());
  const { paths: args, folders, session: given } = await takeOpening();

  // The first window of a run is the one that reads state.json; a window it
  // brings back was handed its own entry, and one opened with `new window`
  // has none and starts empty.
  const state = given ? [] : await loadState();
  const first = isFirstWindow();
  const session = given ?? (first ? (state[0] ?? null) : null);

  // The reading positions are the app's, not this window's, so a window with
  // no entry of its own still takes them from the one that has them.
  seedReading(session ?? state[0] ?? null);

  // The library, the recent list and the reading positions come back either
  // way; only the list of open files depends on the arguments (spec §6).
  if (session) {
    if (session.library) await openLibraryPath(session.library, false);
    store.setCollapsed(session.collapsed);
    store.setRecent(session.recent);
    store.setRecentLibraries(session.recentLibraries);
    restoreZoom(session.zoom);
    store.setRailView(session.rail.view);
    store.setRailWidth(session.rail.width);
    store.setRailCollapsed(session.rail.collapsed);
    store.setSplitRatio(session.split);
  }

  const open = async () => {
    // A folder argument is the library, and it replaces the last session's
    // open files — you asked for that folder, not for yesterday (spec §6).
    const folder = folders[0];
    if (folder) await openLibraryPath(folder);
    if (args.length > 0) {
      if ((await openPaths(args)) && !folder) useStore.getState().setRailCollapsed(true);
      return;
    }
    if (folder) return;
    if (session && session.files.length > 0) await restore(session);
    // Only now, and only for a window that came back as itself: a launch
    // that asked for a file asked for that file, not for yesterday's
    // windows, exactly as it already replaces yesterday's documents.
    if (first && !given) await restoreWindows(state);
  };

  // The drafts folder is the app's, not this window's, so only the first
  // window of a run offers what is in it. Three windows each offering to
  // restore the same unsaved file would be three chances to answer the same
  // question, and two of them wrong (spec §8).
  const drafts = first && !given ? await listDrafts() : [];
  if (drafts.length > 0) {
    afterRecovery = open;
    store.setRecovery(drafts);
    return;
  }
  await open();
  fitRail();
  // Rust now knows what this window holds even if nothing in it ever
  // changes: without this an empty window would have no entry in state.json,
  // and closing another window would write the file without it.
  await flushSession();
}

/**
 * The rail the session asked for is the reader's choice; whether it fits is
 * this window's business, and only now that the choice has been restored can
 * the two be reconciled (review #6).
 */
function fitRail(): void {
  if (typeof window === "undefined") return;
  useStore.getState().fitRail(window.innerWidth);
}
