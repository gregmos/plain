// One EditorState per document, kept outside React so that leaving edit and
// coming back keeps history, selection and scroll (spec §5.0).

import { EditorState } from "@codemirror/state";
import { normalizeEol } from "../app/eol";
import type { Doc } from "../app/store";
import { useStore } from "../app/store";
import type { Settings } from "../app/settings";
import { editorExtensions } from "./setup";

export interface Buffer {
  state: EditorState;
  /**
   * The text on disk as CodeMirror holds it — line endings normalized to
   * `\n`. `dirty` is a comparison against this, so both sides must be
   * normalized or a CRLF file would never look clean again. Saving writes
   * the file back in its own dominant style (§8).
   */
  savedText: string;
  scrollTop: number;
}

const buffers = new Map<string, Buffer>();

/** The buffer for a document, created from `doc.text` on first use. */
export function buffer(doc: Doc, settings: Settings): Buffer {
  const existing = buffers.get(doc.id);
  if (existing) return existing;
  const state = EditorState.create({
    doc: doc.text,
    extensions: editorExtensions(doc, settings),
  });
  // Not the text we just loaded: a restored draft is already unsaved work,
  // and its clean text is whatever the file on disk holds (spec §8).
  const created: Buffer = {
    state,
    savedText: normalizeEol(doc.savedText),
    scrollTop: 0,
  };
  buffers.set(doc.id, created);
  return created;
}

export function keepBuffer(id: string, state: EditorState, scrollTop: number): void {
  const existing = buffers.get(id);
  if (existing) {
    existing.state = state;
    existing.scrollTop = scrollTop;
  }
}

/** Called after a successful save, with the text that reached the disk. */
export function markSaved(id: string, text: string): void {
  const existing = buffers.get(id);
  if (existing) existing.savedText = normalizeEol(text);
}

/**
 * The one dirty test. A document that has never been in edit has no buffer,
 * so the document's own copy of the disk text answers for it.
 */
export function isDirty(id: string, text: string): boolean {
  const existing = buffers.get(id);
  if (existing) return existing.savedText !== normalizeEol(text);
  const doc = useStore.getState().docs.find((d) => d.id === id);
  return doc ? normalizeEol(doc.savedText) !== normalizeEol(text) : false;
}

/** An external reload, applied as one change so undo has a single step. */
export function setBufferText(id: string, text: string): void {
  const existing = buffers.get(id);
  if (!existing) return;
  existing.state = existing.state.update({
    changes: { from: 0, to: existing.state.doc.length, insert: text },
  }).state;
}

/** Save As keeps the buffer — history and all — under the new file's id. */
export function moveBuffer(from: string, to: string): void {
  const existing = buffers.get(from);
  if (!existing || from === to) return;
  buffers.delete(from);
  buffers.set(to, existing);
}

export function dropBuffer(id: string): void {
  buffers.delete(id);
}

// A closed document must not leave its buffer behind: opening the file again
// has to read it from disk, not from a state we kept.
useStore.subscribe((state, previous) => {
  if (state.docs.length >= previous.docs.length) return;
  for (const id of buffers.keys()) {
    if (!state.docs.some((d) => d.id === id)) buffers.delete(id);
  }
});

/** Tests only. */
export function clearBuffers(): void {
  buffers.clear();
}
