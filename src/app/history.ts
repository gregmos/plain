// Version history and the line diff (spec §2a). Snapshots themselves are
// taken by Rust on a successful write; this is the screen's side of it —
// listing, restoring, opening and deleting — plus the comparison both the
// history and the conflict banner show.

import { invoke } from "@tauri-apps/api/core";
import { diffLines } from "diff";
import { documentKey, moveDraft } from "./drafts";
import { inTauri } from "./env";
import { normalizeEol } from "./eol";
import { docFields, fsError, readFile } from "./fs";
import { basename, pathKey } from "./paths";
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
 * would say — `force` is how Rust is told so. Taken before a restore, and
 * before a file that changed on disk replaces the buffer, so the text being
 * replaced is never the only copy (spec §2a, §8). Says whether it worked: a
 * restore that goes ahead without it can destroy the last copy of that text
 * (review #1).
 */
export async function snapshotBuffer(doc: Doc): Promise<boolean> {
  if (!inTauri) return true;
  const text = normalizeEol(doc.text);
  const attempt = (encoding: string, bom: boolean) =>
    invoke("snapshot_text", {
      request: { id: documentKey(doc), text, encoding, bom, eol: doc.eol, force: true },
    });
  try {
    await attempt(doc.encoding, doc.bom);
    return true;
  } catch {
    // cp1251 cannot hold an emoji the buffer picked up, and a safety copy is
    // worth more than matching the file's encoding. Reading it back detects
    // the encoding anyway (review #1).
    try {
      await attempt("utf-8", false);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * The versions of a file follow it when it is renamed: the folder they live
 * in is named after the path (review w10 #2).
 */
export async function moveHistory(
  from: Pick<Doc, "id" | "path">,
  to: Pick<Doc, "id" | "path">,
): Promise<boolean> {
  if (!inTauri) return false;
  const oldId = documentKey(from);
  const newId = documentKey(to);
  if (oldId === newId) return false;
  try {
    return await invoke<boolean>("rename_history", { oldId, newId });
  } catch {
    return false;
  }
}

/**
 * Everything a document keeps beside itself, moved to its new name: its
 * versions first, then its recovery draft. A rename, not a copy — Save As
 * makes a new document and starts a history of its own.
 */
export async function migrateDocument(oldPath: string, newPath: string): Promise<void> {
  const from = { id: pathKey(oldPath), path: oldPath };
  const to = { id: pathKey(newPath), path: newPath };
  await moveHistory(from, to);
  await moveDraft(from, to);
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
/**
 * Where each run of changed lines starts. `previous`/`next` on the compare
 * screen step through these rather than through single lines, so a rewritten
 * paragraph counts as one difference and not as ten.
 */
export function changeBlocks(rows: DiffRow[]): number[] {
  const starts: number[] = [];
  let inside = false;
  rows.forEach((row, index) => {
    const changed = row.kind !== "same";
    if (changed && !inside) starts.push(index);
    inside = changed;
  });
  return starts;
}

/** The block a row belongs to, or -1. Used to outline the current one. */
export function blockOf(starts: number[], rows: DiffRow[], index: number): number {
  if (rows[index]?.kind === "same") return -1;
  let found = -1;
  for (let at = 0; at < starts.length; at += 1) {
    if ((starts[at] as number) <= index) found = at;
    else break;
  }
  return found;
}

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
