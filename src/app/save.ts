// Ctrl+S and everything around it (spec §8). The rules, in order:
// a clean document is never written; the snapshot that goes to disk is taken
// from the live editor inside the operation and compared to the buffer after
// it; the base hash always follows a successful write; a document only moves
// to a new file once the bytes are there; nothing the user did not touch
// changes.

import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  flushActiveEditor,
  isDirty,
  markSaved,
  renameBuffer,
  replaceText,
  setReadOnly,
} from "../editor";
import { documentKey, dropDraft, writeDraft } from "./drafts";
import { inTauri } from "./env";
import { encodingLabel, isLegacy, normalizeEol, serialize } from "./eol";
import {
  canonicalPath,
  docFields,
  fsError,
  hashFile,
  readFile,
  writeFileAtomic,
  type FileInfo,
} from "./fs";
import { snapshotBuffer } from "./history";
import { basename, dirname, pathKey } from "./paths";
import { activeDoc, useStore, type Comparison, type Doc } from "./store";
import { heldElsewhere } from "./windows";

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

/**
 * `announce` is what the status bar says on success — `undefined` for an
 * autosave, which by §2a passes without a word.
 */
async function write(id: string, target: Target, announce?: string): Promise<boolean> {
  const current = liveDoc(id);
  if (!current) return false;
  const snapshot = normalizeEol(current.text);

  try {
    const written = await writeFileAtomic({
      path: target.path,
      text: serialize(snapshot, current.eol),
      encoding: current.encoding,
      bom: current.bom,
      eol: current.eol,
      baseHash: target.baseHash,
      allowMissing: target.allowMissing ?? false,
      // Rust keeps a copy of exactly these bytes, at most one every five
      // minutes per document (spec §2a).
      snapshotId: documentKey({ id, path: target.path }),
    });
    const settled = target.adopt ? target.adopt() : id;
    settle(settled, snapshot, written.hash);

    // One message, not three overwriting each other. The status bar has one
    // slot and one timer, so a `saved` landing on top of a snapshot failure
    // is the same as never having said it (review w11 #2).
    const said: string[] = [];
    // One of the two allowed transformations, and it says so (spec §1.3) —
    // which is more worth saying than `saved`.
    if (current.mixedEol) {
      useStore.getState().updateDoc(settled, { mixedEol: false });
      said.push(`line endings normalized to ${current.eol}`);
    } else if (announce) {
      said.push(announce);
    }
    // The save worked; the copy for the history did not. That part is said
    // even for an autosave, which is otherwise silent: it is not good news.
    if (written.snapshotError) said.push(`snapshot failed — ${written.snapshotError}`);
    if (said.length > 0) useStore.getState().setMessage(said.join(" · "));
    return true;
  } catch (error) {
    const failure = fsError(error);
    if (failure.kind === "conflict") {
      showConflict(id);
      return false;
    }
    // Deleted from under us, and the buffer holds edits: put the file back.
    if (failure.kind === "missing") {
      const back = await write(id, { ...target, allowMissing: true }, announce);
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

interface SaveOptions {
  /** The autosave: it says nothing at all (spec §2a). */
  quiet?: boolean;
  /** What the status bar says instead of `saved` — a conversion, say. */
  announce?: string;
}

/** `Ctrl+S`. Resolves to false when the document is still unsaved. */
export function save(id: string, options: SaveOptions = {}): Promise<boolean> {
  return queued(id, () => saveNow(id, options));
}

/**
 * The body of a save, without the queue around it, so Save As onto the file
 * the document already has can come back through here rather than round the
 * outside of every check (review #2).
 */
async function saveNow(id: string, options: SaveOptions = {}): Promise<boolean> {
  const quiet = options.quiet === true;
  const current = liveDoc(id);
  if (!current) return true;
  // A buffer that was never on disk goes through the Save As dialog (§6).
  // Called directly: it is already inside this document's queue.
  if (!current.path) return saveAsNow(id);
  if (current.readOnly) {
    useStore.getState().setMessage("read-only — use save as…");
    return false;
  }
  // §8: a clean document is not written at all. Saying nothing about it
  // reads like a save that quietly failed, so it says that instead.
  if (!isDirty(id, current.text)) {
    if (!quiet) useStore.getState().setMessage("nothing to save");
    return true;
  }
  if (current.decodeErrors) {
    askAboutDecodeErrors(current, () => void save(id, options));
    return false;
  }
  if (isLegacy(current.encoding)) {
    askAboutEncoding(current);
    return false;
  }
  // Deleted from under us: the buffer's edits go back to disk (spec §6).
  const recreate = current.deleted;
  const written = await write(
    id,
    { path: current.path, baseHash: current.baseHash, allowMissing: recreate },
    quiet ? undefined : (options.announce ?? "saved"),
  );
  if (written && recreate) useStore.getState().setNote("recreated");
  return written;
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
  // Asked before the file dialog, so the answer is about the text rather than
  // about a name that has already been picked (review #2).
  if (opening.decodeErrors) {
    askAboutDecodeErrors(opening, () => void saveAs(id));
    return false;
  }

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
  // Picking the name it already has is a save, not a Save As: it goes through
  // the ordinary path so the base hash is checked and the encoding is asked
  // about, instead of overwriting the original unconditionally (review #2).
  if (nextId === id && opening.path) return saveNow(id);
  // The same reason, for a file whose buffer is in another window: that
  // window would go on holding bytes nobody agreed to, and this one cannot
  // take the document off it (W13 §5.4).
  if ((await heldElsewhere([nextId])).size > 0) {
    useStore
      .getState()
      .setMessage(`${basename(target)} is open in another window — close it there first`);
    return false;
  }
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
  // A new file is never written in a legacy encoding (spec §8); this is a
  // copy under a new name, so it is said rather than asked.
  const legacy = isLegacy(current.encoding);
  if (legacy) useStore.getState().setMessage("the copy is utf-8");
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
    // The copy of a read-only file is editable, but the EditorState that came
    // with the buffer still holds `readOnly.of(true)` and would swallow every
    // keystroke (review w67 #5).
    setReadOnly(nextId, false);
    return nextId;
  };

  // `write` reads encoding and bom off the document, so the conversion has to
  // be visible to it; it is undone again if the write fails.
  if (legacy) useStore.getState().updateDoc(id, { encoding, bom });
  const written = await write(
    id,
    { path: target, baseHash: null, allowMissing: true, adopt },
    "saved",
  );
  if (!written) {
    if (legacy) {
      useStore.getState().updateDoc(id, { encoding: current.encoding, bom: current.bom });
    }
    return false;
  }
  // The old name's draft described edits that have just been written
  // somewhere else, so it goes. Its history stays where it is: the old file
  // is still on disk and those versions are its own — Save As makes a copy,
  // not a rename (review w10 #2).
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
          // Said by the save itself, or its own `saved` would land on top.
          void save(current.id, { announce: "converted to utf-8" });
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
function askAboutDecodeErrors(current: Doc, retry: () => void): void {
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
          retry();
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
      { label: "compare", run: () => void compareWithDisk(id) },
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
      setReadOnly(id, fields.readOnly);
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

/* --------------------------------------------------- comparing (spec §2a) */

/**
 * `compare` in the conflict banner: the file as it is on disk beside the
 * buffer. The screen is the choice — taking the disk version there replaces
 * the buffer without a second question.
 */
export async function compareWithDisk(id: string): Promise<void> {
  const current = liveDoc(id);
  if (!current?.path) return;
  try {
    const info = await readFile(current.path);
    useStore.getState().setComparison({
      id,
      leftLabel: "disk",
      left: normalizeEol(info.text),
      diskInfo: info,
      rightLabel: "buffer",
      right: normalizeEol(current.text),
      takeLabel: "take disk",
      fromDisk: true,
    });
  } catch (error) {
    useStore.getState().setMessage(`couldn't compare — ${fsError(error).message}`);
  }
}

/* -------------------------------------------------- autosave (spec §2a) */

/**
 * N seconds after the last change to a buffer, that buffer is saved the
 * ordinary way — conflicts and failures raise the same banners a `Ctrl+S`
 * would, and a success says nothing at all.
 */
export function createAutosave(run: (id: string) => void): {
  touch: (id: string, seconds: number) => void;
  cancel: (id: string) => void;
  stop: () => void;
} {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const cancel = (id: string) => {
    const timer = timers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    timers.delete(id);
  };

  return {
    touch(id, seconds) {
      cancel(id);
      if (seconds <= 0) return;
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          run(id);
        }, seconds * 1000),
      );
    },
    cancel,
    stop() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}

const autosave = createAutosave((id) => void save(id, { quiet: true }));

/** Every buffer that changes is on the same clock, one timer per document. */
export function installAutosave(): () => void {
  const unsubscribe = useStore.subscribe((state, previous) => {
    const seconds = state.settings.files.autosave;
    // Turning it off, or moving the interval, has to reach the waits that are
    // already running — they were set from the old value (review #6).
    if (seconds !== previous.settings.files.autosave) {
      autosave.stop();
      if (seconds > 0) {
        for (const doc of state.docs) {
          if (!doc.path || doc.readOnly) continue;
          if (isDirty(doc.id, doc.text)) autosave.touch(doc.id, seconds);
        }
      }
      return;
    }
    if (state.docs === previous.docs) return;
    for (const doc of state.docs) {
      const before = previous.docs.find((d) => d.id === doc.id);
      if (!before || before.revision === doc.revision) continue;
      // A buffer with no file of its own would open a dialog, which is not
      // something a timer may do (spec §2a, §6).
      if (!doc.path || doc.readOnly) continue;
      autosave.touch(doc.id, seconds);
    }
    // A document that closed takes its timer with it.
    for (const gone of previous.docs) {
      if (!state.docs.some((d) => d.id === gone.id)) autosave.cancel(gone.id);
    }
  });
  return () => {
    unsubscribe();
    autosave.stop();
  };
}

/* ---------------------------------------------- restoring (reviews #1–#4) */

interface Restore {
  id: string;
  /** What goes into the buffer. */
  text: string;
  /** Set when the text is a file as it was read: taking it is a reload. */
  disk?: FileInfo;
  note: string;
}

/**
 * The one way a snapshot or the disk version replaces a buffer, for both the
 * history screen and the diff screen. In the document's own queue, so an
 * autosave cannot land in the middle; the text being replaced goes into the
 * history first and nothing happens if that fails; and the buffer is checked
 * again immediately before the swap, because the editor stayed usable while
 * all of this was being read (reviews #1, #2, #4).
 */
export function restoreIntoBuffer(request: Restore): Promise<boolean> {
  const { id, text, disk, note } = request;
  return queued(id, async () => {
    const store = useStore.getState();
    const before = liveDoc(id);
    if (!before) return false;
    const revision = before.revision;

    // The version on screen is the version that gets applied; if the file has
    // moved on since it was drawn, show that instead (review #2).
    if (disk && before.path) {
      const now = await hashFile(before.path).catch(() => disk.hash);
      if (now !== disk.hash) {
        await compareWithDisk(id);
        store.setMessage("the file changed again — compare shows it now");
        return false;
      }
    }

    const kept = await snapshotBuffer(before);
    if (!kept) {
      store.showBanner({
        id: "save-failed",
        text: "couldn't keep a copy of the current text — nothing was replaced",
        actions: [{ label: "dismiss", run: () => store.dismissBanner("save-failed") }],
      });
      return false;
    }

    const current = liveDoc(id);
    if (!current) return false;
    if (current.revision !== revision) {
      store.setMessage("the buffer changed — nothing was replaced");
      return false;
    }

    if (disk) {
      // Taking the disk version is a reload: base hash and saved text too, or
      // the next save conflicts with the version just accepted.
      const fields = docFields(disk);
      useStore.getState().updateDoc(id, fields);
      setReadOnly(id, fields.readOnly);
      replaceText(id, fields.text);
      void dropDraft(current);
      useStore.getState().dismissBanner("conflict");
    } else {
      replaceText(id, text);
      // `replaceText` takes the new text as the saved one, which is right for
      // a reload and wrong here: a snapshot is not on disk. Putting the mark
      // back on the file's own text leaves the document `unsaved` (§2a).
      markSaved(id, current.savedText);
      useStore.getState().updateDoc(id, {
        text,
        dirty: text !== current.savedText,
      });
    }
    useStore.getState().setNote(note);
    return true;
  });
}

/** `restore` on the history screen (spec §2a). */
export async function restoreSnapshot(id: string, path: string): Promise<boolean> {
  try {
    const info = await readFile(path);
    return await restoreIntoBuffer({ id, text: normalizeEol(info.text), note: "restored" });
  } catch (error) {
    useStore.getState().setMessage(`couldn't restore — ${fsError(error).message}`);
    return false;
  }
}

/** `take disk` / `take snapshot` on the diff screen (spec §2a). */
export function takeComparison(comparison: Comparison): Promise<boolean> {
  return restoreIntoBuffer({
    id: comparison.id,
    text: comparison.left,
    disk: comparison.diskInfo ?? undefined,
    note: comparison.fromDisk ? "took the disk version" : "restored",
  });
}
