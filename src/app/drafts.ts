// %APPDATA%\Plain\drafts\<id>.json — the copy of an edited buffer that
// survives a kill (spec §8). Written on a 500 ms debounce and at least once
// every 2 s of continuous typing; deleted only when that same text has
// reached the disk, or when the user says `don't save`.

import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, readDir, readTextFile, remove } from "@tauri-apps/plugin-fs";
import { isDirty } from "../editor/buffers";
import { normalizeEol, type Eol } from "./eol";
import { inTauri } from "./env";
import { readFile, trashPath, writeTextAtomic } from "./fs";
import { basename, pathKey } from "./paths";
import { makeDoc, useStore, type Doc, type Recovery } from "./store";

const FOLDER = "drafts";
export const DEBOUNCE_MS = 500;
export const MAX_WAIT_MS = 2000;

export interface Draft {
  text: string;
  path: string | null;
  title: string;
  baseHash: string | null;
  encoding: string;
  bom: boolean;
  eol: Eol;
  finalNewline: boolean;
  caret: { line: number; col: number } | null;
  savedAt: number;
}

/** Short, stable and derived from the path — the same file always lands on
 *  the same draft, run after run. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function draftName(doc: Pick<Doc, "id" | "path">): string {
  return `${fnv1a(doc.path ? pathKey(doc.path) : doc.id)}.json`;
}

async function draftPath(doc: Pick<Doc, "id" | "path">): Promise<string> {
  return join(await appDataDir(), FOLDER, draftName(doc));
}

/* --------------------------------------------------------------- writing */

/**
 * Debounce with a ceiling: quiet for 500 ms writes, and typing that never
 * pauses still gets written every 2 s (spec §8).
 */
export function createSchedule(run: () => void): { push: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let firstAt = 0;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    firstAt = 0;
    run();
  };

  return {
    push() {
      const now = Date.now();
      if (firstAt === 0) firstAt = now;
      if (now - firstAt >= MAX_WAIT_MS) {
        flush();
        return;
      }
      clearTimeout(timer);
      timer = setTimeout(flush, DEBOUNCE_MS);
    },
    flush,
  };
}

const pending = new Set<string>();

const schedule = createSchedule(() => {
  const ids = [...pending];
  pending.clear();
  for (const id of ids) void writeDraft(id);
});

export function scheduleDraft(id: string): void {
  pending.add(id);
  schedule.push();
}

export function flushDrafts(): void {
  schedule.flush();
}

/** Tests only. */
export function pendingDrafts(): string[] {
  return [...pending];
}

export async function writeDraft(id: string): Promise<void> {
  if (!inTauri) return;
  const doc = useStore.getState().docs.find((d) => d.id === id);
  if (!doc || !isDirty(doc.id, doc.text)) return;

  const draft: Draft = {
    text: normalizeEol(doc.text),
    path: doc.path,
    title: doc.title,
    baseHash: doc.baseHash,
    encoding: doc.encoding,
    bom: doc.bom,
    eol: doc.eol,
    finalNewline: doc.finalNewline,
    caret: doc.caret,
    savedAt: Date.now(),
  };
  try {
    await writeTextAtomic(await draftPath(doc), JSON.stringify(draft));
    useStore.getState().dismissBanner("drafts");
  } catch {
    // Nothing to offer here: the user cannot fix %APPDATA% from inside the
    // app, and the banner has to stay up as long as the risk does (§8).
    useStore.getState().showBanner({ id: "drafts", text: "can't write recovery draft" });
  }
}

export async function dropDraft(doc: Pick<Doc, "id" | "path">): Promise<void> {
  if (!inTauri) return;
  pending.delete(doc.id);
  try {
    const file = await draftPath(doc);
    if (await exists(file)) await remove(file);
  } catch {
    /* a draft that will not go away is not worth a banner */
  }
}

/** Every dirty buffer belongs to the store, so one subscription covers all. */
export function installDrafts(): () => void {
  return useStore.subscribe((state, previous) => {
    if (state.docs === previous.docs) return;
    for (const doc of state.docs) {
      const before = previous.docs.find((d) => d.id === doc.id);
      if (before && before.text === doc.text && before.baseHash === doc.baseHash) continue;
      if (isDirty(doc.id, doc.text)) scheduleDraft(doc.id);
    }
  });
}

/* ------------------------------------------------------------ recovering */

async function loadDraft(file: string): Promise<Draft | null> {
  try {
    const parsed: unknown = JSON.parse(await readTextFile(file));
    if (!parsed || typeof parsed !== "object") return null;
    const draft = parsed as Draft;
    return typeof draft.text === "string" ? draft : null;
  } catch {
    return null;
  }
}

/** What the `unsaved work found` screen lists at startup (spec §8). */
export async function listDrafts(): Promise<Recovery[]> {
  if (!inTauri) return [];
  try {
    const folder = await join(await appDataDir(), FOLDER);
    if (!(await exists(folder))) return [];
    const found: Recovery[] = [];
    for (const entry of await readDir(folder)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      const file = await join(folder, entry.name);
      const draft = await loadDraft(file);
      if (!draft) continue;
      found.push({
        file,
        path: draft.path,
        title: draft.title || (draft.path ? basename(draft.path) : "Untitled"),
        savedAt: draft.savedAt ?? 0,
      });
    }
    return found.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/**
 * Opens the draft as an unsaved document. Says whether the file on disk has
 * moved on since — the caller raises the conflict banner, so this module does
 * not have to know about banners.
 */
export async function restoreDraft(entry: Recovery): Promise<{ id: string; conflict: boolean } | null> {
  const draft = await loadDraft(entry.file);
  if (!draft) return null;

  const text = normalizeEol(draft.text);
  let savedText = "";
  let readOnly = false;
  let deleted = false;
  let conflict = false;

  if (draft.path) {
    try {
      const info = await readFile(draft.path);
      savedText = normalizeEol(info.text);
      readOnly = info.readOnly;
      conflict = info.hash !== draft.baseHash;
    } catch {
      deleted = true;
    }
  }

  const id = draft.path ? pathKey(draft.path) : entry.file;
  const doc = makeDoc({
    id,
    path: draft.path,
    title: entry.title,
    text,
    savedText,
    dirty: text !== savedText,
    mode: "edit",
    readOnly,
    deleted,
    encoding: draft.encoding ?? "utf-8",
    bom: draft.bom ?? false,
    eol: draft.eol ?? "crlf",
    finalNewline: draft.finalNewline ?? false,
    baseHash: draft.baseHash ?? null,
    caret: draft.caret ?? null,
  });
  useStore.getState().openDoc(doc);
  return { id, conflict };
}

/** `discard` goes to the Recycle Bin, not to nowhere (spec §8). */
export async function discardDraft(entry: Recovery): Promise<void> {
  if (!inTauri) return;
  try {
    await trashPath(entry.file);
  } catch {
    try {
      await remove(entry.file);
    } catch {
      /* nothing else to try */
    }
  }
}
