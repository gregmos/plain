// Startup: settings, then unsaved work, then either the paths this launch
// was asked to open or the session that was open last time (spec §6, §8).

import { listen } from "@tauri-apps/api/event";
import { drainPendingPaths, openLibraryPath, openPaths } from "./commands";
import { listDrafts } from "./drafts";
import { inTauri } from "./env";
import { pathKey } from "./paths";
import {
  loadSession,
  normalizeSession,
  readingPosition,
  seedReading,
  type SessionFile,
} from "./session";
import { restoreZoom } from "./zoom";
import { loadSettings } from "./settings";
import { useStore } from "./store";
import { installSettingsSync, isFirstWindow, settingsLoaded, takeOpening } from "./windows";
import { emitGotoHeading } from "../read/events";

/** Held while the `unsaved work found` screen is up (spec §8). */
let afterRecovery: (() => Promise<void>) | null = null;

/**
 * Finder does not put a double-clicked file in argv: it sends an Apple Event,
 * so `open-path` can land after `takeOpening()` has come back empty (spec
 * §13a). Draining the queue beside `restore()` would let the session's own
 * `activate` land last — the file you clicked open, but behind yesterday's
 * document. So the queue waits, and startup resolves this when it is done.
 */
let settleStartup: () => void = () => {};
const startupSettled = new Promise<void>((resolve) => {
  settleStartup = resolve;
});

export function recoveryDone(): void {
  const next = afterRecovery;
  afterRecovery = null;
  useStore.getState().setRecovery(null);
  void (async () => {
    try {
      await next?.();
      fitRail();
    } finally {
      // Startup ran through the recovery screen, so it ends here.
      settleStartup();
    }
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

export async function bootstrap(): Promise<void> {
  // Before the file is read, and awaited: settings written by another window
  // while this one is starting must not be lost (W13 §7.2, M4).
  await installSettingsSync();
  const { settings, invalid } = await loadSettings();
  const store = useStore.getState();
  store.applySettings(settings);
  // Whatever arrived during that read was written after it began, so it goes
  // on top of what the file said.
  settingsLoaded();
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
  // A nudge during startup is held until startup is done (spec §13a).
  await listen("open-path", () => void startupSettled.then(() => drainPendingPaths()));

  // The recovery screen takes startup over and ends it in `recoveryDone`;
  // every other way out of here ends it below, failure included, because a
  // file that is waiting must never be left waiting.
  let handedOff = false;
  try {
    // One packet, taken once: the paths this window was handed, and — for a
    // window `file → new window` made — the session it starts on (W13 §2.2).
    const { paths: args, folders, seed } = await takeOpening();

    // Only `main` reads state.json, and only `main` writes it: windows do not
    // come back after a restart, so a second window has nothing there to read
    // and nothing of its own to leave (W13 §2.2, §4.1).
    const FIRST = isFirstWindow();

    // The library, the recent list and the reading positions come back either
    // way; only the list of open files depends on the arguments (spec §6).
    const session = FIRST ? await loadSession() : normalizeSession(seed);
    // `loadSession` seeds the reading positions itself; a seed is handed over
    // rather than read, so it does it here (W13 §2.2).
    if (!FIRST && session) seedReading(session);
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
    };

    // The drafts folder is the app's, not this window's, so only the window a
    // run starts with offers what is in it: three windows asking the same
    // question would be two chances to answer it wrong (W13 §2.3, M7).
    const drafts = FIRST ? await listDrafts() : [];
    if (drafts.length > 0) {
      afterRecovery = open;
      store.setRecovery(drafts);
      handedOff = true;
      return;
    }
    await open();
    fitRail();
  } finally {
    if (!handedOff) settleStartup();
  }
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
