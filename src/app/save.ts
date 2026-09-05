// Ctrl+S and everything around it (spec §8). The rules, in order:
// a clean document is never written; the snapshot that goes to disk is taken
// before the write and compared to the buffer after it; the base hash always
// follows a successful write; nothing the user did not touch changes.

import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { flushActiveEditor, isDirty, markSaved, renameBuffer, replaceText } from "../editor";
import { dropBuffer } from "../editor/buffers";
import { dropDraft, writeDraft } from "./drafts";
import { inTauri } from "./env";
import { encodingLabel, isLegacy, normalizeEol, serialize } from "./eol";
import { docFields, fsError, readFile, writeFileAtomic } from "./fs";
import { dirname, pathKey } from "./paths";
import { activeDoc, useStore, type Doc } from "./store";

/* -------------------------------------------------------------- plumbing */

/**
 * Writes of one document never overlap: a second Ctrl+S waits for the first
 * (spec §8). Rust serializes writes too; this keeps the store consistent.
 */
const queues = new Map<string, Promise<unknown>>();

function queued<T>(id: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(id) ?? Promise.resolve();
  const next = previous.then(run, run);
  queues.set(id, next);
  void next.catch(() => undefined).then(() => {
    if (queues.get(id) === next) queues.delete(id);
  });
  return next;
}

function doc(id: string): Doc | undefined {
  return useStore.getState().docs.find((d) => d.id === id);
}

/* ------------------------------------------------------------- the write */

/**
 * The base hash always follows a successful write, or the next save would
 * conflict with our own file (spec §8). Then the buffer is compared to the
 * snapshot: unchanged means saved and the draft can go, changed means the
 * document is still unsaved and the draft stays with the new base hash.
 */
function settle(id: string, snapshot: string, hash: string): void {
  const store = useStore.getState();
  markSaved(id, snapshot);
  // Anything typed while the write was in flight counts against the snapshot,
  // so the editor is read now rather than on its next idle callback.
  flushActiveEditor();
  const current = doc(id);
  if (!current) return;
  const dirty = normalizeEol(current.text) !== snapshot;
  store.updateDoc(id, { savedText: snapshot, baseHash: hash, dirty, deleted: false });
  store.dismissBanner("conflict");
  store.dismissBanner("save-failed");
  if (dirty) void writeDraft(id);
  else void dropDraft(current);
}

interface Target {
  path: string;
  baseHash: string | null;
  allowMissing?: boolean;
}

async function write(id: string, target: Target): Promise<boolean> {
  const current = doc(id);
  if (!current) return false;
  const snapshot = normalizeEol(current.text);

  try {
    const hash = await writeFileAtomic({
      path: target.path,
      text: serialize(snapshot, current.eol),
      encoding: current.encoding,
      bom: current.bom,
      eol: current.eol,
      baseHash: target.baseHash,
      allowMissing: target.allowMissing ?? false,
    });
    settle(id, snapshot, hash);
    // One of the two allowed transformations, and it says so (spec §1.3).
    if (current.mixedEol) {
      useStore.getState().updateDoc(id, { mixedEol: false });
      useStore.getState().setMessage(`line endings normalized to ${current.eol}`);
    }
    return true;
  } catch (error) {
    const failure = fsError(error);
    if (failure.kind === "conflict") {
      showConflict(id);
      return false;
    }
    // Deleted from under us, and the buffer holds edits: put the file back.
    if (failure.kind === "missing") {
      const back = await write(id, { ...target, allowMissing: true });
      if (back) useStore.getState().setNote("recreated");
      return back;
    }
    useStore.getState().showBanner({
      id: "save-failed",
      text: `couldn't save — ${failure.message}`,
      actions: [
        { label: "retry", run: () => void save(id) },
        { label: "save as…", run: () => void saveAs(id) },
      ],
    });
    return false;
  }
}

/* ------------------------------------------------------------- commands */

export function saveActive(): Promise<boolean> {
  flushActiveEditor();
  const current = activeDoc(useStore.getState());
  return current ? save(current.id) : Promise.resolve(true);
}

/** `Ctrl+S`. Resolves to false when the document is still unsaved. */
export function save(id: string): Promise<boolean> {
  flushActiveEditor();
  return queued(id, async () => {
    const current = doc(id);
    if (!current) return true;
    // A buffer that was never on disk goes through the Save As dialog (§6).
    if (!current.path) return saveAs(id);
    if (current.readOnly) {
      useStore.getState().setMessage("read-only — use save as…");
      return false;
    }
    // §8: a clean document is not written at all, and says nothing.
    if (!isDirty(id, current.text)) return true;
    if (isLegacy(current.encoding)) {
      askAboutEncoding(current);
      return false;
    }
    // Deleted from under us: the buffer's edits go back to disk (spec §6).
    const recreate = current.deleted;
    const written = await write(id, {
      path: current.path,
      baseHash: current.baseHash,
      allowMissing: recreate,
    });
    if (written && recreate) useStore.getState().setNote("recreated");
    return written;
  });
}

/** `Ctrl+Shift+S`, and the way out of every conflict. */
export async function saveAs(id: string): Promise<boolean> {
  if (!inTauri) return false;
  flushActiveEditor();
  const store = useStore.getState();
  const current = doc(id);
  if (!current) return false;

  const folder = current.path ? dirname(current.path) : store.libraryPath;
  const suggestion = current.path ?? (folder ? `${folder}\\${current.title}.md` : `${current.title}.md`);
  const extensions = store.settings.library.extensions.map((e) => e.replace(/^\./, ""));
  const picked = await saveDialog({
    defaultPath: suggestion,
    filters: [{ name: "markdown", extensions }],
  });
  if (typeof picked !== "string") return false;

  const nextId = pathKey(picked);
  const previous = { id: current.id, path: current.path };

  if (nextId !== current.id) {
    // Saving over a file that is already open would give it two buffers.
    const clash = useStore.getState().docs.find((d) => d.id === nextId);
    if (clash) {
      useStore.getState().closeDoc(clash.id);
      dropBuffer(clash.id);
    }
    renameBuffer(current.id, nextId);
    useStore.getState().renameDoc(current.id, picked);
  }

  // A new file is never written in a legacy encoding (spec §8).
  if (isLegacy(current.encoding)) {
    useStore.getState().updateDoc(nextId, { encoding: "utf-8", bom: false });
  }
  useStore.getState().updateDoc(nextId, { readOnly: false, deleted: false });

  const written = await write(nextId, { path: picked, baseHash: null, allowMissing: true });
  if (written && previous.id !== nextId) void dropDraft(previous);
  return written;
}

/** cp1251 and friends: the one conversion the app is allowed to do (§1.3). */
function askAboutEncoding(current: Doc): void {
  const store = useStore.getState();
  store.setDialog({
    title: `${current.title} is not utf-8`,
    lines: [`saving converts it from ${current.encoding} to utf-8.`],
    actions: [
      {
        label: "convert to utf-8",
        run: () => {
          store.setDialog(null);
          useStore.getState().updateDoc(current.id, { encoding: "utf-8", bom: false });
          useStore.getState().setMessage("converted to utf-8");
          void save(current.id);
        },
      },
      {
        label: "save as…",
        run: () => {
          store.setDialog(null);
          void saveAs(current.id);
        },
      },
      { label: "cancel", run: () => store.setDialog(null) },
    ],
    cancel: () => store.setDialog(null),
  });
}

/* ------------------------------------------- reading the file back again */

/** The same banner for a failed save and for a watcher hit (spec §8). */
export function showConflict(id: string): void {
  const store = useStore.getState();
  if (!doc(id)) return;
  store.showBanner({
    id: "conflict",
    text: "file changed on disk",
    actions: [
      { label: "reload", run: () => askAboutReload(id) },
      {
        label: "save my copy as…",
        run: () => {
          store.dismissBanner("conflict");
          void saveAs(id);
        },
      },
    ],
  });
}

function askAboutReload(id: string): void {
  const store = useStore.getState();
  const current = doc(id);
  if (!current) return;
  if (!isDirty(id, current.text)) {
    void reloadFromDisk(id);
    return;
  }
  store.setDialog({
    title: "reload from disk?",
    lines: [`your changes to ${current.title} are lost.`],
    actions: [
      {
        label: "reload",
        run: () => {
          store.setDialog(null);
          void reloadFromDisk(id);
        },
      },
      { label: "cancel", run: () => store.setDialog(null) },
    ],
    cancel: () => store.setDialog(null),
  });
}

/** Reads the file again and drops it into the buffer as one undo step. */
export async function reloadFromDisk(id: string, note = "reloaded from disk"): Promise<void> {
  const current = doc(id);
  if (!current?.path) return;
  try {
    const fields = docFields(await readFile(current.path));
    useStore.getState().updateDoc(id, fields);
    replaceText(id, fields.text);
    void dropDraft(current);
    useStore.getState().dismissBanner("conflict");
    if (note) useStore.getState().setNote(note);
  } catch (error) {
    useStore.getState().setMessage(`couldn't reload — ${fsError(error).message}`);
  }
}

/** The status bar's `reopen as…` (spec §8). */
export function reopenAs(encoding: string): void {
  const store = useStore.getState();
  const current = activeDoc(store);
  if (!current?.path) return;

  const run = async () => {
    try {
      const fields = docFields(await readFile(current.path as string, encoding));
      useStore.getState().updateDoc(current.id, fields);
      replaceText(current.id, fields.text);
      useStore.getState().setNote(`reopened as ${encodingLabel(encoding)}`);
    } catch (error) {
      useStore.getState().setMessage(`couldn't reopen — ${fsError(error).message}`);
    }
  };

  if (!isDirty(current.id, current.text)) {
    void run();
    return;
  }
  store.setDialog({
    title: `reopen as ${encodingLabel(encoding)}?`,
    lines: [`your changes to ${current.title} are lost.`],
    actions: [
      {
        label: "reopen",
        run: () => {
          store.setDialog(null);
          void run();
        },
      },
      { label: "cancel", run: () => store.setDialog(null) },
    ],
    cancel: () => store.setDialog(null),
  });
}
