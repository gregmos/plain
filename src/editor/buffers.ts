// One EditorState per document, kept outside React so that leaving edit and
// coming back keeps history, selection and scroll (spec §5.0).

import { EditorState } from "@codemirror/state";
import type { Doc } from "../app/store";
import { useStore } from "../app/store";
import type { Settings } from "../app/settings";
import { editorExtensions } from "./setup";

export interface Buffer {
  state: EditorState;
  /**
   * The loaded text as CodeMirror holds it — line endings normalized to `\n`.
   * `dirty` is a comparison against this, so both sides must be normalized or
   * a CRLF file would never look clean again. Wave 4 writes the file back in
   * its own dominant style (§8).
   */
  savedText: string;
  scrollTop: number;
}

/** CodeMirror normalizes line endings; everything compared to it must too. */
export function normalizeEol(text: string): string {
  return text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
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
  const created: Buffer = { state, savedText: state.doc.toString(), scrollTop: 0 };
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

/** Wave 4 calls this after a successful save, with the text it wrote. */
export function markSaved(id: string, text: string): void {
  const existing = buffers.get(id);
  if (existing) existing.savedText = normalizeEol(text);
}

export function isDirty(id: string, text: string): boolean {
  const existing = buffers.get(id);
  return existing ? existing.savedText !== normalizeEol(text) : false;
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
