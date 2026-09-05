// Version history and the line diff (spec §2a). Snapshots themselves are
// taken by Rust on a successful write; this is the screen's side of it —
// listing, restoring, opening and deleting — plus the comparison both the
// history and the conflict banner show.

import { invoke } from "@tauri-apps/api/core";
import { diffLines } from "diff";
import { markSaved, replaceText } from "../editor";
import { documentKey } from "./drafts";
import { inTauri } from "./env";
import { normalizeEol } from "./eol";
import { docFields, fsError, readFile } from "./fs";
import { basename } from "./paths";
import { makeDoc, useStore, type Doc } from "./store";

export interface Snapshot {
  path: string;
  takenAt: number;
  size: number;
}

/** Newest first. Empty when the document was never saved from here. */
export async function listSnapshots(doc: Pick<Doc, "id" | "path">): Promise<Snapshot[]> {
  if (!inTauri) return [];
  try {
    return await invoke<Snapshot[]>("list_snapshots", { id: documentKey(doc) });
  } catch {
    return [];
  }
}

/**
 * A copy of what the buffer holds right now, whatever the five-minute rule
 * would say. Taken before a restore, so the text being replaced is never the
 * only copy (spec §2a).
 */
export async function snapshotBuffer(doc: Doc): Promise<void> {
  if (!inTauri) return;
  try {
    await invoke("snapshot_text", {
      request: {
        id: documentKey(doc),
        text: normalizeEol(doc.text),
        encoding: doc.encoding,
        bom: doc.bom,
        eol: doc.eol,
      },
    });
  } catch {
    /* a missing safety copy must not stop the restore the user asked for */
  }
}

export async function deleteSnapshot(snapshot: Snapshot): Promise<boolean> {
  if (!inTauri) return true;
  try {
    await invoke("delete_snapshot", { path: snapshot.path });
    return true;
  } catch (error) {
    useStore.getState().setMessage(`couldn't delete — ${fsError(error).message}`);
    return false;
  }
}

/**
 * Into the buffer, not onto the disk: one undo step, and the document is
 * left `unsaved` so the user still decides (spec §2a).
 */
export async function restoreSnapshot(id: string, snapshot: Snapshot): Promise<void> {
  const store = useStore.getState();
  const doc = store.docs.find((d) => d.id === id);
  if (!doc) return;
  try {
    const info = await readFile(snapshot.path);
    // The text about to be replaced gets a snapshot of its own first, so
    // nothing the user had is only in the buffer (spec §2a).
    await snapshotBuffer(doc);
    const text = normalizeEol(info.text);
    replaceText(id, text);
    // `replaceText` takes the new text as the saved one, which is right for a
    // reload from disk and wrong here: this text is not on disk yet. Putting
    // the mark back on the file's own text leaves the document `unsaved`.
    markSaved(id, doc.savedText);
    store.updateDoc(id, { text, dirty: text !== doc.savedText });
    store.setNote("restored");
  } catch (error) {
    store.setMessage(`couldn't restore — ${fsError(error).message}`);
  }
}

/** A snapshot opened as its own document: read-only, keyed by its path. */
export async function openSnapshot(title: string, snapshot: Snapshot): Promise<void> {
  try {
    const info = await readFile(snapshot.path);
    useStore.getState().openDoc(
      makeDoc({
        ...docFields(info),
        id: snapshot.path.toLowerCase(),
        path: snapshot.path,
        title: `${title} · ${basename(snapshot.path).replace(/\.md$/, "")}`,
        readOnly: true,
      }),
    );
  } catch (error) {
    useStore.getState().setMessage(`couldn't open — ${fsError(error).message}`);
  }
}

/* ----------------------------------------------------------------- diff */

export type DiffKind = "same" | "added" | "removed";

export interface DiffRow {
  kind: DiffKind;
  text: string;
}

/**
 * Line by line, left to right: what is only on the left was removed, what is
 * only on the right was added (spec §2a). A trailing newline is not a line,
 * so it never shows up as an empty row at the end.
 */
export function diffRows(left: string, right: string): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const part of diffLines(normalizeEol(left), normalizeEol(right))) {
    const kind: DiffKind = part.added ? "added" : part.removed ? "removed" : "same";
    const lines = part.value.split("\n");
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    for (const text of lines) rows.push({ kind, text });
  }
  return rows;
}
