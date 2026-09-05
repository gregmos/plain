// Editor -> store. Nothing is written from inside a CodeMirror update:
// measured on a 1 MB file, a store write on that path cost ~30 ms per
// keystroke and 2 ms off it. So the caret rides one frame behind and the text
// goes back when the browser is idle (the status bar counts words over it).

import { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { Doc } from "../app/store";
import { useStore } from "../app/store";
import { headingsOf } from "../read/headings";
import { isDirty } from "./buffers";

/**
 * Re-reading the headings means parsing the whole document, so it happens
 * while the outline is on screen — the only thing that shows them — and on
 * documents small enough for it not to matter either way (review #8).
 */
const CHEAP_ENOUGH = 200_000;

function wantsHeadings(doc: Doc, text: string): boolean {
  if (doc.large) return false;
  const state = useStore.getState();
  const outline = !state.railCollapsed && state.railView === "outline";
  return outline || text.length <= CHEAP_ENOUGH;
}

export function caretOf(state: EditorState): { line: number; col: number } {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number, col: head - line.from + 1 };
}

let idle: number | null = null;
let frame: number | null = null;

/**
 * The document the mounted editor is showing. Not `activeId`: between the
 * store switching documents and the view catching up there is a window where
 * the two disagree, and text must never land on the wrong document (§1.3).
 */
let shownId: string | null = null;

export function setSyncTarget(id: string | null): void {
  shownId = id;
}

function cancelIdle(): void {
  if (idle === null) return;
  if (typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
  else window.clearTimeout(idle);
  idle = null;
}

function cancelFrame(): void {
  if (frame === null) return;
  cancelAnimationFrame(frame);
  frame = null;
}

/**
 * Writes text and caret into the store now — on idle, on unmount and on a
 * document switch. It takes the caret too, because it cancels the frame that
 * would otherwise have carried it.
 */
export function flushText(view: EditorView, id: string): void {
  cancelIdle();
  cancelFrame();
  const store = useStore.getState();
  const current = store.docs.find((d) => d.id === id);
  if (!current) return;
  const text = view.state.doc.toString();
  const caret = caretOf(view.state);
  const patch: Partial<Omit<Doc, "id">> = {};
  if (current.text !== text) {
    patch.text = text;
    // Read stamps the headings when it renders; in edit nothing else does,
    // and the outline would keep pointing at the lines they used to be on.
    if (wantsHeadings(current, text)) patch.headings = headingsOf(text);
  }
  // The authority on `dirty`: the frame below only ever guesses `true`, and
  // an undo or a reload from disk has to be able to take it back.
  const dirty = isDirty(id, text);
  if (current.dirty !== dirty) patch.dirty = dirty;
  const previous = current.caret;
  if (!previous || previous.line !== caret.line || previous.col !== caret.col) {
    patch.caret = caret;
  }
  if (Object.keys(patch).length > 0) store.updateDoc(id, patch);
}

function scheduleText(view: EditorView, id: string): void {
  if (idle !== null) return;
  const run = () => {
    idle = null;
    flushText(view, id);
  };
  idle =
    typeof window.requestIdleCallback === "function"
      ? window.requestIdleCallback(run, { timeout: 500 })
      : window.setTimeout(run, 200);
}

/** Caret, plus the dirty dot — it shouldn't wait for the text flush. */
function pushCaret(view: EditorView, id: string, dirty: boolean): void {
  const store = useStore.getState();
  const current = store.docs.find((d) => d.id === id);
  if (!current) return;
  const caret = caretOf(view.state);
  const previous = current.caret;
  const patch: Partial<Omit<Doc, "id">> = {};
  if (!previous || previous.line !== caret.line || previous.col !== caret.col) {
    patch.caret = caret;
  }
  if (dirty && !current.dirty) patch.dirty = true;
  if (Object.keys(patch).length > 0) store.updateDoc(id, patch);
}

/** On mount and on document switch the status bar should not lag a frame. */
export function syncCaret(view: EditorView, id: string): void {
  cancelFrame();
  pushCaret(view, id, false);
}

function scheduleCaret(view: EditorView, id: string, dirty: boolean): void {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    pushCaret(view, id, dirty);
  });
}

/** Patches the document the view is actually showing. */
export const storeSync = EditorView.updateListener.of((update) => {
  if (!update.docChanged && !update.selectionSet) return;
  const id = shownId;
  if (id === null) return;
  if (update.docChanged) scheduleText(update.view, id);
  scheduleCaret(update.view, id, update.docChanged);
});
