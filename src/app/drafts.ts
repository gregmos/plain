// %APPDATA%\Plain\drafts\<id>.json — the copy of an edited buffer that
// survives a kill (spec §8). Written on a 500 ms debounce and at least once
// every 2 s of continuous typing; deleted only when that same text has
// reached the disk, or when the user says `don't save`.

import { join } from "@tauri-apps/api/path";
import { exists, readDir, readTextFile, remove } from "@tauri-apps/plugin-fs";
import { isDirty } from "../editor/buffers";
import { normalizeEol, type Eol } from "./eol";
import { inTauri } from "./env";
import { readFile, trashPath, writeTextAtomic } from "./fs";
import { basename, pathKey } from "./paths";
import { dataDir } from "./settings";
import { makeDoc, useStore, type Doc, type Recovery } from "./store";

const FOLDER = "drafts";
export const DEBOUNCE_MS = 500;
export const MAX_WAIT_MS = 2000;

export interface Draft {
  text: string;
  path: string | null;
  /**
   * The document id this draft was written for. A nameless buffer has no
   * path to be found by, so restoring it under the same id is the only way
   * the draft can be deleted again afterwards (spec §8).
   */
  id: string;
  title: string;
  baseHash: string | null;
  encoding: string;
  bom: boolean;
  eol: Eol;
  finalNewline: boolean;
  /**
   * The buffer holds replacement characters where the encoding could not read
   * the file. Recovery has to bring the warning back with the text, or the
   * first save after a restore makes the damage permanent (review #1).
   */
  decodeErrors: boolean;
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

/**
 * The id a document's own files are named by — its draft, and its folder in
 * the history. Derived from the path so it is the same run after run.
 */
export function documentKey(doc: Pick<Doc, "id" | "path">): string {
  return fnv1a(doc.path ? pathKey(doc.path) : doc.id);
}

export function draftName(doc: Pick<Doc, "id" | "path">): string {
  return `${documentKey(doc)}.json`;
}

async function draftPath(doc: Pick<Doc, "id" | "path">): Promise<string> {
  return join(await dataDir(), FOLDER, draftName(doc));
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

/**
 * One chain of file operations per document. A delete never overtakes the
 * write it is meant to cancel, and a write queued before a delete does not
 * come back afterwards to resurrect text the user threw away (spec §8).
 */
export function createDraftQueue(): {
  write(id: string, run: () => Promise<void>): Promise<void>;
  drop(id: string, run: () => Promise<void>): Promise<void>;
  settled(): Promise<void>;
} {
  const chains = new Map<string, Promise<unknown>>();
  const generations = new Map<string, number>();

  const chain = (id: string, run: () => Promise<void>): Promise<void> => {
    const previous = chains.get(id) ?? Promise.resolve();
    const next = previous.then(run, run);
    chains.set(id, next);
    void next.catch(() => undefined).then(() => {
      if (chains.get(id) === next) chains.delete(id);
    });
    return next;
  };

  return {
    write(id, run) {
      const generation = generations.get(id) ?? 0;
      return chain(id, async () => {
        // A delete came in while this was waiting: the text it would write
        // is exactly the text that was abandoned.
        if ((generations.get(id) ?? 0) !== generation) return;
        await run();
      });
    },
    drop(id, run) {
      generations.set(id, (generations.get(id) ?? 0) + 1);
      return chain(id, run);
    },
    settled() {
      const running = [...chains.values()].map((p) => p.catch(() => undefined));
      return Promise.all(running).then(() => undefined);
    },
  };
}

const files = createDraftQueue();

/** Closing waits for this: a draft must not outlive the buffer it copies. */
export function draftsSettled(): Promise<void> {
  return files.settled();
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

export function writeDraft(id: string): Promise<void> {
  return files.write(id, async () => {
    if (!inTauri) return;
    const doc = useStore.getState().docs.find((d) => d.id === id);
    if (!doc || !isDirty(doc.id, doc.text)) return;

    const draft: Draft = {
      text: normalizeEol(doc.text),
      path: doc.path,
      id: doc.id,
      title: doc.title,
      baseHash: doc.baseHash,
      encoding: doc.encoding,
      bom: doc.bom,
      eol: doc.eol,
      finalNewline: doc.finalNewline,
      decodeErrors: doc.decodeErrors,
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
  });
}

export function dropDraft(doc: Pick<Doc, "id" | "path">): Promise<void> {
  pending.delete(doc.id);
  return files.drop(doc.id, async () => {
    if (!inTauri) return;
    try {
      const file = await draftPath(doc);
      if (await exists(file)) await remove(file);
    } catch {
      /* a draft that will not go away is not worth a banner */
    }
  });
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
    const folder = await join(await dataDir(), FOLDER);
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
  // Either source may know: the draft carries the flag, and a draft written
  // before it did gets the answer from the file itself (review #1).
  let decodeErrors = draft.decodeErrors === true;

  if (draft.path) {
    try {
      // Read the way the buffer was: `reopen as…` may have forced an encoding
      // that detection would not choose, and that is the frame `savedText`
      // and the decode warning both belong to.
      const info = await readFile(draft.path, draft.encoding);
      savedText = normalizeEol(info.text);
      readOnly = info.readOnly;
      conflict = info.hash !== draft.baseHash;
      decodeErrors = decodeErrors || info.decodeErrors;
    } catch {
      deleted = true;
    }
  }

  // A nameless buffer keeps the id it had when the draft was written, so the
  // draft file it maps to is the one that gets deleted on save (spec §8).
  const id = draft.path ? pathKey(draft.path) : (draft.id ?? entry.file);
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
    decodeErrors,
    baseHash: draft.baseHash ?? null,
    caret: draft.caret ?? null,
  });
  useStore.getState().openDoc(doc);
  return { id, conflict };
}

/**
 * `discard` goes to the Recycle Bin, not to nowhere (spec §8). A Recycle Bin
 * that refuses is not a licence to delete the draft outright — the row stays
 * and the user is told, so the text is still recoverable.
 */
export async function discardDraft(entry: Recovery): Promise<boolean> {
  if (!inTauri) return true;
  try {
    await trashPath(entry.file);
    return true;
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    useStore.getState().showBanner({
      id: "discard-failed",
      text: `couldn't discard ${entry.title} — ${why}`,
      actions: [
        {
          label: "dismiss",
          run: () => useStore.getState().dismissBanner("discard-failed"),
        },
      ],
    });
    return false;
  }
}
