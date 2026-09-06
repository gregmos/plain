// What the caret is standing in, for the format bar (spec §5.2, v2.6).
//
// The bar lights a button when the caret is inside what that button makes:
// bold inside `**`, `heading 2` on an `##` line, and so on. The answer comes
// from the syntax tree, so it costs nothing extra — the parse is already
// there — and it is recomputed on a pause, not on every cursor step.

import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { isProse, listKind } from "./commands";

/** Button ids the bar can light up. */
export type Format =
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bullet"
  | "ordered"
  | "task"
  | "quote"
  | "link"
  | "highlight"
  | "wikilink";

const INLINE: Record<string, Format> = {
  StrongEmphasis: "bold",
  Emphasis: "italic",
  Strikethrough: "strike",
  InlineCode: "code",
  Link: "link",
};

const HEADINGS: Record<string, Format> = {
  ATXHeading1: "heading1",
  SetextHeading1: "heading1",
  ATXHeading2: "heading2",
  SetextHeading2: "heading2",
  ATXHeading3: "heading3",
};

/** Where `pos` sits, as a set of button ids (pure — the bar's whole logic). */
export function activeFormats(state: EditorState, pos: number): Set<Format> {
  const found = new Set<Format>();

  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    const inline = INLINE[node.name];
    // `[[wikilink]]`: the parser reads the inner brackets as a link, and that
    // is not what the caret is standing in.
    const wikiInner =
      node.name === "Link" &&
      (state.sliceDoc(Math.max(0, node.from - 1), node.from) === "[" ||
        state.sliceDoc(node.to, node.to + 1) === "]");
    if (inline && !wikiInner) found.add(inline);
    const heading = HEADINGS[node.name];
    if (heading) found.add(heading);
    if (node.name === "Blockquote") found.add("quote");
  }

  // Inside code (or a link target) markdown is text, and none of the line
  // scanning below applies (review #11).
  if (!isProse(state, pos)) return found;

  // `==` and `[[ ]]` are not in the grammar (spec §11), so they are read off
  // the line — the same way rich hides them.
  const line = state.doc.lineAt(pos);
  const column = pos - line.from;
  for (const [pattern, format] of [
    [/==[^=\n]+==/g, "highlight"],
    [/\[\[[^\]\n]+\]\]/g, "wikilink"],
  ] as const) {
    for (const match of line.text.matchAll(pattern)) {
      const start = match.index ?? 0;
      if (column >= start && column <= start + match[0].length) found.add(format);
    }
  }

  const kind = listKind(line.text);
  if (kind === "bullet") found.add("bullet");
  else if (kind === "ordered") found.add("ordered");
  else if (kind === "task") found.add("task");

  return found;
}

/* ----------------------------------------------------------- the signal */

let current: ReadonlySet<Format> = new Set();
const listeners = new Set<() => void>();

export function activeSnapshot(): ReadonlySet<Format> {
  return current;
}

export function subscribeActive(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function publish(next: Set<Format>): void {
  if (next.size === current.size && [...next].every((item) => current.has(item))) return;
  current = next;
  for (const listener of listeners) listener();
}

/** A pause, not every keystroke: nothing here is worth a frame (v2.6). */
const SETTLE_MS = 100;

/**
 * The bar follows the editor that is on screen: it is told what the caret is
 * in when the view appears (a new document included, since CodeMirror builds
 * its plugins again for one), on a pause after the caret moves, and nothing
 * at all once the view is gone (review #10).
 */
export const activeWatch = ViewPlugin.fromClass(
  class {
    private timer: number | null = null;

    constructor(view: EditorView) {
      publish(activeFormats(view.state, view.state.selection.main.head));
    }

    update(update: ViewUpdate): void {
      if (!update.docChanged && !update.selectionSet && !update.focusChanged) return;
      this.settle(update.view);
    }

    destroy(): void {
      if (this.timer !== null) window.clearTimeout(this.timer);
      this.timer = null;
    }

    private settle(view: EditorView): void {
      if (this.timer !== null) window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        this.timer = null;
        publish(activeFormats(view.state, view.state.selection.main.head));
      }, SETTLE_MS);
    }
  },
);
