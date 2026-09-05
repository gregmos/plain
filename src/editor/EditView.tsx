import { useEffect, useRef, useState } from "react";
import { EditorView, type Command as EditorCommand } from "@codemirror/view";
import type { Doc, Heading } from "../app/store";
import { useStore } from "../app/store";
import { buffer, keepBuffer, markSaved, moveBuffer, setBufferText } from "./buffers";
import { headingsOf } from "../read/headings";
import { richConf, richExtension } from "./rich";
import { gutterConf, gutterExtension, lineNumbersOn, onLineNumbers } from "./setup";
import { flushText, setSyncTarget, syncCaret } from "./sync";
import "../ui/editor.css";

const GOTO_LINE = "plain:goto-line";
const GOTO_HEADING = "plain:goto-heading";
/** A jump sent just before this view mounts is still ours; an older one is not. */
const PENDING_MS = 2000;

let live: EditorView | null = null;
let liveId: string | null = null;
let pending: { goto: Goto; at: number } | null = null;

/**
 * Puts whatever the editor holds into the store synchronously. Wave 4 calls
 * this before saving, so the snapshot never waits for the idle callback.
 */
export function flushActiveEditor(): void {
  if (live && liveId) flushText(live, liveId);
}

/**
 * Runs a CodeMirror command against whichever editor is on screen. The menu
 * bar needs this: undo, bold and friends are editor commands, and the menu
 * has no view of its own (spec §4). Nothing mounted — nothing happens.
 */
export function runEditorCommand(command: EditorCommand): boolean {
  if (!live) return false;
  // The menu took the focus away; the command works on the selection anyway,
  // but the caret has to come back or the next keystroke goes nowhere.
  live.focus();
  return command(live);
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

/**
 * Where a `plain:goto-line` wants the editor. `moveCaret` is explicit when
 * the sender says so (the outline moves the caret, a mode switch only
 * scrolls); a bare line number means "move it unless that would throw away a
 * selection" (review #7).
 */
interface Goto {
  line: number;
  moveCaret: boolean | "auto";
}

function readGoto(detail: unknown): Goto | null {
  if (typeof detail === "number") return { line: detail, moveCaret: "auto" };
  if (detail && typeof detail === "object") {
    const it = detail as { line?: unknown; moveCaret?: unknown };
    if (typeof it.line === "number") {
      return { line: it.line, moveCaret: it.moveCaret !== false };
    }
  }
  return null;
}

function jump(view: EditorView, goto: Goto): void {
  const target = view.state.doc.line(Math.min(Math.max(1, goto.line), view.state.doc.lines));
  const move =
    goto.moveCaret === "auto" ? view.state.selection.main.empty : goto.moveCaret;
  // Focus first: focusing after the transaction makes the browser scroll to
  // where the selection used to be, undoing the jump.
  view.focus();
  view.dispatch({
    ...(move ? { selection: { anchor: target.from } } : {}),
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
    const goto = readGoto((event as CustomEvent<unknown>).detail);
    if (!goto) return;
    if (live) jump(live, goto);
    else pending = { goto, at: Date.now() };
  };
  slot[LISTENER_SLOT] = onGotoLine;
  window.addEventListener(GOTO_LINE, onGotoLine);
}

function takePending(view: EditorView): void {
  if (pending && Date.now() - pending.at < PENDING_MS) jump(view, pending.goto);
  pending = null;
}

/**
 * Leaving edit: tell read which heading the top of the screen was under. The
 * ids come from the same parse read uses, or the two would disagree about
 * what a heading is called (review #9).
 */
function announceHeading(view: EditorView, id: string): void {
  const store = useStore.getState();
  const doc = store.docs.find((d) => d.id === id);
  if (store.activeId !== id || doc?.mode !== "read" || doc.large) return;
  let line = 1;
  try {
    const top = view.scrollDOM.getBoundingClientRect().top - view.documentTop;
    line = view.state.doc.lineAt(view.lineBlockAtHeight(top).from).number;
  } catch {
    return;
  }
  let heading: Heading | null = null;
  for (const candidate of headingsOf(view.state.doc.toString())) {
    if (candidate.line > line) break;
    heading = candidate;
  }
  if (!heading) return;
  const target = heading.id;
  // After the current commit, so the read view is already listening.
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(GOTO_HEADING, { detail: target }));
  }, 0);
}

/** `rich` is the same editor with the markers hidden (spec §5.3). */
export function EditView({ doc, rich = false }: { doc: Doc; rich?: boolean }) {
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
    setSyncTarget(doc.id);
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
      setSyncTarget(null);
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
    setSyncTarget(null);
    keepBuffer(previous, current.state, current.scrollDOM.scrollTop);

    const next = buffer(doc, useStore.getState().settings);
    current.setState(next.state);
    current.dispatch({
      effects: [
        gutterConf.reconfigure(gutterExtension(lineNumbersOn() && !rich)),
        richConf.reconfigure(rich ? richExtension : []),
      ],
    });
    shown.current = doc.id;
    liveId = doc.id;
    setSyncTarget(doc.id);
    syncCaret(current, doc.id);
    current.focus();
    current.scrollDOM.scrollTop = next.scrollTop;
    takePending(current);
  }, [doc.id]);

  // Rich gives the left margin to the block markers instead (mockup 1d), so
  // the text column stays where it is in edit.
  const gutter = numbers && !rich;

  useEffect(() => {
    view.current?.dispatch({ effects: gutterConf.reconfigure(gutterExtension(gutter)) });
  }, [gutter]);

  // Entering or leaving rich: the buffer, the caret and the scroll stay put.
  useEffect(() => {
    view.current?.dispatch({ effects: richConf.reconfigure(rich ? richExtension : []) });
  }, [rich]);

  return (
    <div
      className={"edit" + (gutter ? "" : " edit-no-gutter") + (rich ? " edit-rich" : "")}
      ref={host}
    />
  );
}
