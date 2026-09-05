// %APPDATA%\Plain\state.json — what was open and where you were in it
// (spec §8). Window geometry is not here: the window-state plugin owns it.

import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { inTauri } from "./env";
import { writeTextAtomic } from "./fs";
import { pathKey } from "./paths";
import { useStore, type Mode, type RailView } from "./store";

const FILE = "state.json";
const DEBOUNCE_MS = 2000;
/** Reading positions are an LRU, not a growing log (spec §8). */
export const READING_LIMIT = 300;

export interface SessionFile {
  version: 1;
  files: { path: string; mode: Mode; caret: { line: number; col: number } | null }[];
  active: string | null;
  rail: { collapsed: boolean; view: RailView };
  library: string | null;
  /** Relative paths of the folded folders in the tree (spec §6). */
  collapsed: string[];
  recent: string[];
  /** path -> heading id, oldest first. */
  reading: [string, string][];
}

/* ----------------------------------------------------- reading positions */

const positions = new Map<string, string>();

/** Read view calls this while scrolling; re-inserting keeps the LRU order. */
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
    rail: { collapsed: state.railCollapsed, view: state.railView },
    library: state.libraryPath,
    collapsed: state.collapsed,
    recent: state.recent,
    reading: [...positions.entries()],
  };
}

/** Anything unreadable is simply "no session"; a fresh start is not a bug. */
export function parseSession(text: string): SessionFile | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
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
        mode: f.mode === "edit" ? "edit" : "read",
        caret: f.caret && typeof f.caret.line === "number" ? f.caret : null,
      })),
    active: typeof value.active === "string" ? value.active : null,
    rail: {
      collapsed: value.rail?.collapsed === true,
      view: value.rail?.view === "outline" ? "outline" : "files",
    },
    library: typeof value.library === "string" ? value.library : null,
    collapsed: Array.isArray(value.collapsed)
      ? value.collapsed.filter((rel) => typeof rel === "string")
      : [],
    recent: Array.isArray(value.recent) ? value.recent.filter((p) => typeof p === "string") : [],
    reading: reading
      .filter((pair) => Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string")
      .slice(-READING_LIMIT),
  };
}

export async function loadSession(): Promise<SessionFile | null> {
  if (!inTauri) return null;
  try {
    const file = await join(await appDataDir(), FILE);
    if (!(await exists(file))) return null;
    const session = parseSession(await readTextFile(file));
    if (session) {
      positions.clear();
      for (const [path, heading] of session.reading) positions.set(path, heading);
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Takes the session it is given, because closing the window empties the open
 * list before the app is allowed to go — the snapshot has to be older.
 */
export async function writeSession(session: SessionFile): Promise<void> {
  if (!inTauri) return;
  clearTimeout(timer);
  timer = undefined;
  try {
    await writeTextAtomic(await join(await appDataDir(), FILE), JSON.stringify(session));
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
      state.libraryPath === previous.libraryPath &&
      state.collapsed === previous.collapsed &&
      state.recent === previous.recent
    ) {
      return;
    }
    schedule();
  });
}
