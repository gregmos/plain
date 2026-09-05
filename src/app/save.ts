// Ctrl+S and everything around it (spec §8). The rules, in order:
// a clean document is never written; the snapshot that goes to disk is taken
// from the live editor inside the operation and compared to the buffer after
// it; the base hash always follows a successful write; a document only moves
// to a new file once the bytes are there; nothing the user did not touch
// changes.

import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { flushActiveEditor, isDirty, markSaved, renameBuffer, replaceText } from "../editor";
import { dropDraft, writeDraft } from "./drafts";
import { inTauri } from "./env";
import { encodingLabel, isLegacy, normalizeEol, serialize } from "./eol";
import { canonicalPath, docFields, fsError, readFile, writeFileAtomic } from "./fs";
import { dirname, pathKey } from "./paths";
import { activeDoc, useStore, type Doc } from "./store";

/* -------------------------------------------------------------- plumbing */

/**
 * Writes of one document never overlap: a second Ctrl+S waits for the first,
 * and Save As joins the same line (spec §8). Rust serializes writes too; this
 * is what keeps the store consistent.
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

/**
 * The document as the editor has it this instant. Every decision that can
 * lose text — is it dirty, what exactly do we write — is taken from this and
 * never from a `Doc` that was read before an `await` (spec §8).
 */
function liveDoc(id: string): Doc | undefined {
  flushActiveEditor();
  return doc(id);
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
  const current = liveDoc(id);
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
  /**
   * Save As: moves the document onto its new file. Runs only after the bytes
   * are on disk, and returns the id the document now answers to.
   */
  adopt?: () => string;
}

async function write(id: string, target: Target): Promise<boolean> {
  const current = liveDoc(id);
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
    const settled = target.adopt ? target.adopt() : id;
    settle(settled, snapshot, hash);
    // One of the two allowed transformations, and it says so (spec §1.3).
    if (current.mixedEol) {
      useStore.getState().updateDoc(settled, { mixedEol: false });
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
  const current = activeDoc(useStore.getState());
  return current ? save(current.id) : Promise.resolve(true);
}

/** `Ctrl+S`. Resolves to false when the document is still unsaved. */
export function save(id: string): Promise<boolean> {
  return queued(id, async () => {
    const current = liveDoc(id);
    if (!current) return true;
    // A buffer that was never on disk goes through the Save As dialog (§6).
    // Called directly: it is already inside this document's queue.
    if (!current.path) return saveAsNow(id);
    if (current.readOnly) {
      useStore.getState().setMessage("read-only — use save as…");
      return false;
    }
    // §8: a clean document is not written at all, and says nothing.
    if (!isDirty(id, current.text)) return true;
    if (current.decodeErrors) {
      askAboutDecodeErrors(current);
      return false;
    }
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
export function saveAs(id: string): Promise<boolean> {
  return queued(id, () => saveAsNow(id));
}

async function saveAsNow(id: string): Promise<boolean> {
  if (!inTauri) return false;
  const store = useStore.getState();
  const opening = doc(id);
  if (!opening) return false;

  const folder = opening.path ? dirname(opening.path) : store.libraryPath;
  const suggestion =
    opening.path ?? (folder ? `${folder}\\${opening.title}.md` : `${opening.title}.md`);
  const extensions = store.settings.library.extensions.map((e) => e.replace(/^\./, ""));
  const picked = await saveDialog({
    defaultPath: suggestion,
    filters: [{ name: "markdown", extensions }],
  });
  if (typeof picked !== "string") return false;

  // The dialog gives back whatever the user navigated to; the document is
  // keyed off the one spelling the disk uses (spec §8).
  const target = await canonicalPath(picked).catch(() => picked);
  const nextId = pathKey(target);
  // Writing over a file that is open would leave that document's buffer and
  // its draft pointing at bytes it never agreed to (spec §8).
  const clash = useStore.getState().docs.find((d) => d.id === nextId && d.id !== id);
  if (clash) {
    useStore.getState().setMessage(`close ${clash.title} first`);
    return false;
  }

  // The snapshot comes from the live buffer, after the dialog, inside the
  // operation — not from the document as it looked when Save As was asked for.
  const current = liveDoc(id);
  if (!current) return false;
  // A new file is never written in a legacy encoding (spec §8).
  const legacy = isLegacy(current.encoding);
  const encoding = legacy ? "utf-8" : current.encoding;
  const bom = legacy ? false : current.bom;
  const previous = { id: current.id, path: current.path };

  // Nothing about the document moves until the bytes are on disk; a failed
  // write leaves it exactly where it was.
  const adopt = (): string => {
    if (nextId !== id) {
      renameBuffer(id, nextId);
      useStore.getState().renameDoc(id, target);
    }
    useStore.getState().updateDoc(nextId, {
      encoding,
      bom,
      readOnly: false,
      deleted: false,
      decodeErrors: false,
    });
    return nextId;
  };

  // `write` reads encoding and bom off the document, so the conversion has to
  // be visible to it; it is undone again if the write fails.
  if (legacy) useStore.getState().updateDoc(id, { encoding, bom });
  const written = await write(id, {
    path: target,
    baseHash: null,
    allowMissing: true,
    adopt,
  });
  if (!written) {
    if (legacy) {
      useStore.getState().updateDoc(id, { encoding: current.encoding, bom: current.bom });
    }
    return false;
  }
  if (previous.id !== nextId) void dropDraft(previous);
  return true;
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

/**
 * The file held bytes the encoding could not read, and the buffer shows them
 * as `�`. Writing that back makes the loss permanent, so it is a choice
 * the user makes once, out loud (spec §8).
 */
function askAboutDecodeErrors(current: Doc): void {
  const store = useStore.getState();
  store.setDialog({
    title: "text had undecodable bytes",
    lines: [
      `${current.title} was read as ${encodingLabel(current.encoding)} and parts of it did not fit.`,
      "saving replaces those bytes for good; `reopen as…` can try another encoding first.",
    ],
    actions: [
      {
        label: "save anyway",
        run: () => {
          store.setDialog(null);
          useStore.getState().updateDoc(current.id, { decodeErrors: false });
          void save(current.id);
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
  const current = liveDoc(id);
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
          // The user has said the edits may go, so this one does not ask again.
          void reloadFromDisk(id, { force: true });
        },
      },
      { label: "cancel", run: () => store.setDialog(null) },
    ],
    cancel: () => store.setDialog(null),
  });
}

interface ReloadOptions {
  /** Status note when it happened; "" keeps the status bar quiet. */
  note?: string;
  /** The user has agreed to lose the buffer; skip the safety checks. */
  force?: boolean;
}

/**
 * Reads the file again and drops it into the buffer as one undo step. The
 * "this buffer is clean" decision is taken twice — once on live text before
 * the read, once right before the swap — because a keystroke in between must
 * not be overwritten silently (spec §8).
 */
export async function reloadFromDisk(id: string, options: ReloadOptions = {}): Promise<void> {
  const { note = "reloaded from disk", force = false } = options;
  const before = liveDoc(id);
  if (!before?.path) return;
  if (!force && isDirty(id, before.text)) {
    showConflict(id);
    return;
  }
  const revision = before.revision;

  try {
    const info = await readFile(before.path);
    const after = liveDoc(id);
    if (!after) return;
    if (!force && (after.revision !== revision || isDirty(id, after.text))) {
      // Typed while the file was being read: the buffer wins and the user is
      // told the file moved instead.
      showConflict(id);
      return;
    }
    const fields = docFields(info);
    useStore.getState().updateDoc(id, fields);
    replaceText(id, fields.text);
    void dropDraft(after);
    useStore.getState().dismissBanner("conflict");
    if (fields.decodeErrors) useStore.getState().setNote("decoded with errors");
    else if (note) useStore.getState().setNote(note);
  } catch (error) {
    useStore.getState().setMessage(`couldn't reload — ${fsError(error).message}`);
  }
}

/** The status bar's `reopen as…` (spec §8). */
export function reopenAs(encoding: string): void {
  const store = useStore.getState();
  const current = activeDoc(store);
  if (!current?.path) return;
  const id = current.id;
  const path = current.path;

  const run = async () => {
    const before = liveDoc(id);
    if (!before) return;
    const revision = before.revision;
    try {
      const info = await readFile(path, encoding);
      const after = liveDoc(id);
      if (!after) return;
      if (after.revision !== revision) {
        useStore.getState().setMessage("not reopened — the buffer changed");
        return;
      }
      const fields = docFields(info);
      useStore.getState().updateDoc(id, fields);
      replaceText(id, fields.text);
      useStore
        .getState()
        .setNote(
          fields.decodeErrors
            ? `${encodingLabel(encoding)} · decoded with errors`
            : `reopened as ${encodingLabel(encoding)}`,
        );
    } catch (error) {
      useStore.getState().setMessage(`couldn't reopen — ${fsError(error).message}`);
    }
  };

  if (!isDirty(id, (liveDoc(id) ?? current).text)) {
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
