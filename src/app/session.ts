// %APPDATA%\Plain\state.json — what was open and where you were in it
// (spec §8). Window geometry is not here: the window-state plugin owns it.

import { join } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { inTauri } from "./env";
import { writeTextAtomic } from "./fs";
import { pathKey } from "./paths";
import { dataDir } from "./settings";
import { clampRailWidth, useStore, type LibrarySort, type Mode, type RailView } from "./store";
import { isFirstWindow } from "./windows";

const FILE = "state.json";
const DEBOUNCE_MS = 2000;
/** Reading positions are an LRU, not a growing log (spec §8). */
export const READING_LIMIT = 300;

export interface SessionFile {
  version: 1;
  files: { path: string; mode: Mode; caret: { line: number; col: number } | null }[];
  active: string | null;
  rail: { collapsed: boolean; view: RailView; width: number };
  /** Editor's share of the width in split view (spec §2a). */
  split: number;
  library: string | null;
  /** Relative paths of the folded folders in the tree (spec §6). */
  collapsed: string[];
  /** How the library screen was last sorted (spec §2a). */
  librarySort: LibrarySort;
  recent: string[];
  /** Folders opened as a library lately, newest first (spec §2a). */
  recentLibraries: string[];
  /** WebView2 zoom factor, so 110% survives a restart. */
  zoom: number;
  /** path -> heading id, oldest first; `""` is the top of the file. */
  reading: [string, string][];
}

/* ----------------------------------------------------- reading positions */

const positions = new Map<string, string>();

/**
 * Read view calls this while scrolling; re-inserting keeps the LRU order.
 * An empty heading means the top of the document, which is not the same as
 * the first heading — see `restoreTarget` in read/outline.ts.
 */
export function rememberReading(path: string, heading: string): void {
  const key = pathKey(path);
  if (positions.get(key) === heading) return;
  positions.delete(key);
  positions.set(key, heading);
  while (positions.size > READING_LIMIT) {
    const oldest = positions.keys().next();
    if (oldest.done) break;
    positions.delete(oldest.value);
  }
  schedule();
}

export function readingPosition(path: string): string | null {
  return positions.get(pathKey(path)) ?? null;
}

/* ------------------------------------------------------------ the file */

export function toSession(): SessionFile {
  const state = useStore.getState();
  const active = state.docs.find((d) => d.id === state.activeId);
  return {
    version: 1,
    files: state.docs
      .filter((d) => d.path !== null)
      .map((d) => ({ path: d.path as string, mode: d.mode, caret: d.caret })),
    active: active?.path ?? null,
    rail: {
      // What the reader chose, not what the window did: a rail collapsed
      // because the window was narrow must not come back as a closed rail
      // on a wide one (review #6).
      collapsed: state.railAuto ? false : state.railCollapsed,
      view: state.railView,
      width: state.railWidth,
    },
    split: state.splitRatio,
    library: state.libraryPath,
    collapsed: state.collapsed,
    librarySort: state.librarySort,
    recent: state.recent,
    recentLibraries: state.recentLibraries,
    zoom: state.zoom,
    reading: [...positions.entries()],
  };
}

/** Anything unreadable is simply "no session"; a fresh start is not a bug. */
export function parseSession(text: string): SessionFile | null {
  try {
    return normalizeSession(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * The same shaping, for a session that never was a file: the seed a window is
 * made with comes over IPC already parsed (W13 §2.2).
 */
export function normalizeSession(raw: unknown): SessionFile | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<SessionFile>;
  const files = Array.isArray(value.files) ? value.files : [];
  const reading = Array.isArray(value.reading) ? value.reading : [];
  return {
    version: 1,
    files: files
      .filter((f) => f && typeof f.path === "string")
      .map((f) => ({
        path: f.path,
        mode: f.mode === "edit" || f.mode === "rich" || f.mode === "split" ? f.mode : "read",
        caret: f.caret && typeof f.caret.line === "number" ? f.caret : null,
      })),
    active: typeof value.active === "string" ? value.active : null,
    rail: {
      collapsed: value.rail?.collapsed === true,
      view: value.rail?.view === "outline" ? "outline" : "files",
      // A rail dragged to nothing by a broken file would be a rail you
      // cannot get hold of again.
      width: clampRailWidth(
        typeof value.rail?.width === "number" ? value.rail.width : Number.NaN,
      ),
    },
    // A dragged-to-nothing panel would come back as a document you cannot see.
    split:
      typeof value.split === "number" && value.split >= 0.15 && value.split <= 0.85
        ? value.split
        : 0.5,
    library: typeof value.library === "string" ? value.library : null,
    collapsed: Array.isArray(value.collapsed)
      ? value.collapsed.filter((rel) => typeof rel === "string")
      : [],
    librarySort:
      value.librarySort === "name" || value.librarySort === "created"
        ? value.librarySort
        : "modified",
    recent: Array.isArray(value.recent) ? value.recent.filter((p) => typeof p === "string") : [],
    recentLibraries: Array.isArray(value.recentLibraries)
      ? value.recentLibraries.filter((p) => typeof p === "string").slice(0, 5)
      : [],
    // Same bounds the view menu keeps it in; a broken file must not blind you.
    zoom:
      typeof value.zoom === "number" && value.zoom >= 0.5 && value.zoom <= 2 ? value.zoom : 1,
    reading: reading
      .filter((pair) => Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string")
      .slice(-READING_LIMIT),
  };
}

/**
 * The reading positions are the app's, not one window's: a window made from a
 * seed takes them from the session it was seeded with (W13 §2.2).
 */
export function seedReading(session: SessionFile): void {
  positions.clear();
  for (const [path, heading] of session.reading) positions.set(path, heading);
}

export async function loadSession(): Promise<SessionFile | null> {
  if (!inTauri) return null;
  try {
    const file = await join(await dataDir(), FILE);
    if (!(await exists(file))) return null;
    const session = parseSession(await readTextFile(file));
    if (session) seedReading(session);
    return session;
  } catch {
    return null;
  }
}

/**
 * Takes the session it is given, because closing the window empties the open
 * list before the app is allowed to go — the snapshot has to be older.
 *
 * Only `main` writes it, and this one line is what makes that true of every
 * way in: the debounce, `flushSession`, the close scenario and quit (W13 §4).
 * state.json is one snapshot of one window; the others leave `recent` behind
 * them instead (W13 §4.4, M3).
 */
export async function writeSession(session: SessionFile): Promise<void> {
  if (!inTauri || !isFirstWindow()) return;
  clearTimeout(timer);
  timer = undefined;
  try {
    await writeTextAtomic(await join(await dataDir(), FILE), JSON.stringify(session));
  } catch {
    /* losing the session is not worth a banner */
  }
}

export function flushSession(): Promise<void> {
  return writeSession(toSession());
}

let timer: ReturnType<typeof setTimeout> | undefined;

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(() => void flushSession(), DEBOUNCE_MS);
}

/** Everything the session keeps lives in the store, so one watch does it. */
export function installSession(): () => void {
  return useStore.subscribe((state, previous) => {
    if (
      state.docs === previous.docs &&
      state.activeId === previous.activeId &&
      state.railCollapsed === previous.railCollapsed &&
      state.railView === previous.railView &&
      state.railWidth === previous.railWidth &&
      state.libraryPath === previous.libraryPath &&
      state.collapsed === previous.collapsed &&
      state.librarySort === previous.librarySort &&
      state.recent === previous.recent
    ) {
      return;
    }
    schedule();
  });
}
