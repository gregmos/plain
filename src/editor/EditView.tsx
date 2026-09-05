import { useEffect, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import type { Doc } from "../app/store";
import { useStore } from "../app/store";
import { buffer, keepBuffer, markSaved, moveBuffer, setBufferText } from "./buffers";
import { headingAt } from "./headings";
import { gutterConf, gutterExtension, lineNumbersOn, onLineNumbers } from "./setup";
import { flushText, syncCaret } from "./sync";
import "../ui/editor.css";

const GOTO_LINE = "plain:goto-line";
const GOTO_HEADING = "plain:goto-heading";
/** A jump sent just before this view mounts is still ours; an older one is not. */
const PENDING_MS = 2000;

let live: EditorView | null = null;
let liveId: string | null = null;
let pending: { line: number; at: number } | null = null;

/**
 * Puts whatever the editor holds into the store synchronously. Wave 4 calls
 * this before saving, so the snapshot never waits for the idle callback.
 */
export function flushActiveEditor(): void {
  if (live && liveId) flushText(live, liveId);
}

/**
 * Replaces the whole document in one transaction, so a silent reload from
 * disk is a single undo step (spec §8). The new text becomes the clean one.
 */
export function replaceText(id: string, text: string): void {
  if (live && liveId === id) {
    live.dispatch({ changes: { from: 0, to: live.state.doc.length, insert: text } });
    keepBuffer(id, live.state, live.scrollDOM.scrollTop);
    markSaved(id, text);
    // The dispatch queued a sync that would report the document as edited;
    // running it now, after the new text is the clean one, settles it.
    flushText(live, id);
    return;
  }
  setBufferText(id, text);
  markSaved(id, text);
}

/**
 * Save As: the buffer follows the document to its new id. Whatever the live
 * editor holds is stored first, or the move would carry a stale state.
 */
export function renameBuffer(from: string, to: string): void {
  if (live && liveId === from) {
    keepBuffer(from, live.state, live.scrollDOM.scrollTop);
    liveId = to;
  }
  moveBuffer(from, to);
}

function jump(view: EditorView, line: number): void {
  const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
  // Focus first: focusing after the transaction makes the browser scroll to
  // where the selection used to be, undoing the jump.
  view.focus();
  view.dispatch({
    selection: { anchor: target.from },
    effects: EditorView.scrollIntoView(target.from, { y: "start" }),
  });
}

// The outline and read -> edit send this; it can arrive before the view is
// mounted, so it waits here until it is. The listener lives on the module so
// it is there before the first mount; the window slot keeps a hot reload from
// leaving the previous module's listener (and its dead view) behind.
const LISTENER_SLOT = "__plainGotoLine";

if (typeof window !== "undefined") {
  const slot = window as unknown as Record<string, EventListener | undefined>;
  const previous = slot[LISTENER_SLOT];
  if (previous) window.removeEventListener(GOTO_LINE, previous);
  const onGotoLine: EventListener = (event) => {
    const line = (event as CustomEvent<number>).detail;
    if (typeof line !== "number") return;
    if (live) jump(live, line);
    else pending = { line, at: Date.now() };
  };
  slot[LISTENER_SLOT] = onGotoLine;
  window.addEventListener(GOTO_LINE, onGotoLine);
}

function takePending(view: EditorView): void {
  if (pending && Date.now() - pending.at < PENDING_MS) jump(view, pending.line);
  pending = null;
}

/** Leaving edit: tell read which heading the top of the screen was under. */
function announceHeading(view: EditorView, id: string): void {
  const store = useStore.getState();
  const doc = store.docs.find((d) => d.id === id);
  if (store.activeId !== id || doc?.mode !== "read") return;
  let line = 1;
  try {
    const top = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
    line = view.state.doc.lineAt(view.lineBlockAtHeight(top).from).number;
  } catch {
    return;
  }
  const heading = headingAt(view.state.doc.toString(), line);
  if (!heading) return;
  // After the current commit, so the read view is already listening.
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(GOTO_HEADING, { detail: heading.id }));
  }, 0);
}

export function EditView({ doc }: { doc: Doc }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const shown = useRef(doc.id);
  const [numbers, setNumbers] = useState(lineNumbersOn);

  useEffect(() => onLineNumbers(() => setNumbers(lineNumbersOn())), []);

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;
    const { settings } = useStore.getState();
    const opened = buffer(doc, settings);
    const created = new EditorView({ state: opened.state, parent });
    view.current = created;
    live = created;
    liveId = doc.id;
    shown.current = doc.id;
    syncCaret(created, doc.id);
    // Focus first: focusing scrolls the caret into view, so anything we do
    // to the scroll position has to come after it.
    created.focus();
    created.scrollDOM.scrollTop = opened.scrollTop;
    takePending(created);

    return () => {
      const id = shown.current;
      flushText(created, id);
      keepBuffer(id, created.state, created.scrollDOM.scrollTop);
      announceHeading(created, id);
      live = null;
      liveId = null;
      view.current = null;
      created.destroy();
    };
    // Mount only: switching documents is handled below, on the same view.
  }, []);

  // Another document became active while we stay in edit.
  useEffect(() => {
    const current = view.current;
    if (!current || shown.current === doc.id) return;
    const previous = shown.current;
    flushText(current, previous);
    keepBuffer(previous, current.state, current.scrollDOM.scrollTop);

    const next = buffer(doc, useStore.getState().settings);
    current.setState(next.state);
    current.dispatch({ effects: gutterConf.reconfigure(gutterExtension(lineNumbersOn())) });
    shown.current = doc.id;
    liveId = doc.id;
    syncCaret(current, doc.id);
    current.focus();
    current.scrollDOM.scrollTop = next.scrollTop;
    takePending(current);
  }, [doc.id]);

  useEffect(() => {
    view.current?.dispatch({ effects: gutterConf.reconfigure(gutterExtension(numbers)) });
  }, [numbers]);

  return <div className={"edit" + (numbers ? "" : " edit-no-gutter")} ref={host} />;
}
