// Startup: settings, then unsaved work, then either the paths this launch
// was asked to open or the session that was open last time (spec §6, §8).

import { listen } from "@tauri-apps/api/event";
import { drainPendingPaths, openPaths, pendingPaths } from "./commands";
import { listDrafts } from "./drafts";
import { inTauri } from "./env";
import { pathKey } from "./paths";
import { loadSession, readingPosition, type SessionFile } from "./session";
import { loadSettings } from "./settings";
import { useStore } from "./store";
import { emitGotoHeading } from "../read/events";

/** Held while the `unsaved work found` screen is up (spec §8). */
let afterRecovery: (() => Promise<void>) | null = null;

export function recoveryDone(): void {
  const next = afterRecovery;
  afterRecovery = null;
  useStore.getState().setRecovery(null);
  void next?.();
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
  const args = await pendingPaths();

  // The library, the recent list and the reading positions come back either
  // way; only the list of open files depends on the arguments (spec §6).
  const session = await loadSession();
  if (session) {
    store.setLibraryPath(session.library);
    store.setRecent(session.recent);
    store.setRailView(session.rail.view);
    store.setRailCollapsed(session.rail.collapsed);
  }

  const open = async () => {
    if (args.length > 0) {
      if (await openPaths(args)) useStore.getState().setRailCollapsed(true);
      return;
    }
    if (session && session.files.length > 0) await restore(session);
  };

  const drafts = await listDrafts();
  if (drafts.length > 0) {
    afterRecovery = open;
    store.setRecovery(drafts);
    return;
  }
  await open();
}
