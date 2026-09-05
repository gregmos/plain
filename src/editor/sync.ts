// Editor -> store. Nothing is written from inside a CodeMirror update:
// measured on a 1 MB file, a store write on that path cost ~30 ms per
// keystroke and 2 ms off it. So the caret rides one frame behind and the text
// goes back when the browser is idle (the status bar counts words over it).

import { EditorView } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import type { Doc } from "../app/store";
import { useStore } from "../app/store";
import { isDirty } from "./buffers";

export function caretOf(state: EditorState): { line: number; col: number } {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  return { line: line.number, col: head - line.from + 1 };
}

let idle: number | null = null;
let frame: number | null = null;

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
    patch.dirty = isDirty(id, text);
  }
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

/** The editor always shows the active document, so that is the id to patch. */
export const storeSync = EditorView.updateListener.of((update) => {
  if (!update.docChanged && !update.selectionSet) return;
  const id = useStore.getState().activeId;
  if (id === null) return;
  if (update.docChanged) scheduleText(update.view, id);
  scheduleCaret(update.view, id, update.docChanged);
});
