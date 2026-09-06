// cut / copy / paste for the editor's own context menu (spec §2a). They go
// through the EditorView rather than `document.execCommand`, so each is one
// undo step and behaves the same as the chord for it.
//
// The clipboard is a promise, and the editor is a single view that EditView
// reuses for every document. Between asking for the clipboard and coming
// back, the file on screen can have changed, the buffer can have been
// replaced, and the selection can have moved — so nothing is written to the
// document without checking that it is still the document we read (#1).

import type { EditorView } from "@codemirror/view";
import { copyText, pasteText } from "../app/platform";
import { useStore } from "../app/store";
import { syncTarget } from "./sync";

/** What is selected, or "" — cut and copy are the only ones that need it. */
export function selectedText(view: EditorView): string {
  return view.state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => view.state.sliceDoc(range.from, range.to))
    .join("\n");
}

/**
 * Remembers what the view was showing, and answers whether it still is.
 * `syncTarget()` is the document the live editor is bound to; the state
 * identity covers everything else — a new buffer, an edit, a moved caret —
 * because CodeMirror states are immutable.
 */
function unchanged(view: EditorView): () => boolean {
  const doc = syncTarget();
  const state = view.state;
  return () => syncTarget() === doc && view.state === state && !view.state.readOnly;
}

export async function copySelection(view: EditorView): Promise<void> {
  const text = selectedText(view);
  if (text === "") return;
  const store = useStore.getState();
  try {
    await copyText(text);
  } catch {
    store.setMessage("couldn't copy");
    return;
  }
  store.setMessage("copied");
  // Copying changes nothing, so a document that moved on underneath is not a
  // reason to withhold the text — only a reason not to steal the focus back.
  if (view.dom.isConnected) view.focus();
}

export async function cutSelection(view: EditorView): Promise<void> {
  const text = selectedText(view);
  if (text === "") return;
  const store = useStore.getState();
  const same = unchanged(view);
  try {
    await copyText(text);
  } catch {
    store.setMessage("couldn't copy");
    return;
  }
  if (!same()) {
    // The text is on the clipboard, which is harmless; deleting a selection
    // that is no longer the one we copied would not be.
    store.setMessage("selection changed — nothing cut");
    return;
  }
  // `replaceSelection` with nothing deletes every range at once, so a
  // multi-range cut stays a single undo step.
  view.dispatch(view.state.replaceSelection(""));
  store.setMessage("cut");
  view.focus();
}

export async function pasteInto(view: EditorView): Promise<void> {
  const store = useStore.getState();
  const same = unchanged(view);
  let text = "";
  try {
    text = await pasteText();
  } catch {
    store.setMessage("couldn't paste");
    return;
  }
  // Nothing on the clipboard: leave the selection alone rather than
  // replacing it with emptiness.
  if (text === "") return;
  if (!same()) {
    store.setMessage("document changed — nothing pasted");
    return;
  }
  view.dispatch(view.state.replaceSelection(text));
  view.focus();
}
