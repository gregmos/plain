// Rich: the same buffer as edit with the markers tucked away (spec §5.3).
//
// Nothing is parsed twice and nothing is serialized — the document is still
// its own source. A line that holds the caret or part of the selection shows
// everything, the way Typora does it, so editing markup is never blind. Only
// the visible range is looked at, so a megabyte costs the same as a page.

import { syntaxTree } from "@codemirror/language";
import { Compartment, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { toggleCheckboxAt } from "./commands";

export const richConf = new Compartment();

export type RichKind =
  | "hide"
  | "check-off"
  | "check-on"
  | "link"
  | "highlight"
  | "heading"
  | "quote";

export interface RichRange {
  from: number;
  to: number;
  kind: RichKind;
  /** Heading level for `heading`; the glyph shown in the left margin. */
  level?: number;
  mark?: string;
}

const HEADING = /^ATXHeading(\d)$/;
const WIKILINK = /\[\[([^\]|\n]+)(\|([^\]\n]+))?\]\]/g;
const HIGHLIGHT = /==([^=\n]+)==/g;

/** Lines the caret or a selection sits on: those keep their markers. */
export function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n += 1) lines.add(n);
  }
  return lines;
}

function children(node: SyntaxNode, name: string): SyntaxNode[] {
  const out: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) out.push(child);
  }
  return out;
}

/** True when the position sits in a fenced or indented code block. */
function inCode(state: EditorState, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") return true;
  }
  return false;
}

/**
 * What rich hides and decorates between `from` and `to`. Pure, so the rules
 * can be tested without a DOM: the view plugin only turns these into
 * decorations.
 */
/** Nodes whose text is not prose: `==` and `[[ ]]` inside them are literal. */
const GUARDED = new Set([
  "InlineCode",
  "CodeText",
  "CodeMark",
  "Escape",
  "URL",
  "Autolink",
  "LinkMark",
  "LinkTitle",
  "LinkLabel",
  "HTMLTag",
  "Comment",
  "CommentBlock",
]);

export function richRanges(
  state: EditorState,
  from: number,
  to: number,
  active: ReadonlySet<number>,
): RichRange[] {
  const out: RichRange[] = [];
  const guarded: { from: number; to: number }[] = [];
  const doc = state.doc;
  const awake = (pos: number) => active.has(doc.lineAt(pos).number);

  /**
   * A replacing decoration may not cross a line break (CodeMirror throws),
   * and the line being edited keeps its markers — so what is hidden is cut
   * into per-line pieces and any active line among them is left alone.
   */
  const hide = (node: { from: number; to: number }, space = false) => {
    const end = space && doc.sliceString(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
    for (let at = node.from; at < end; ) {
      const line = doc.lineAt(at);
      const stop = Math.min(end, line.to);
      if (stop > at && !active.has(line.number)) out.push({ from: at, to: stop, kind: "hide" });
      at = line.to + 1;
    }
  };

  syntaxTree(state).iterate({
    from,
    to,
    enter(ref) {
      const name = ref.name;

      // Fenced code keeps its fences and its content untouched (§5.3).
      if (name === "FencedCode" || name === "CodeBlock") {
        guarded.push({ from: ref.from, to: ref.to });
        return false;
      }
      if (GUARDED.has(name)) guarded.push({ from: ref.from, to: ref.to });

      const heading = HEADING.exec(name);
      if (heading) {
        const level = Number(heading[1]);
        const line = doc.lineAt(ref.from);
        // The glyph in the margin stands in for the `#` — on the line being
        // edited the real one is back, so it would be there twice.
        out.push({
          from: line.from,
          to: line.from,
          kind: "heading",
          level,
          ...(awake(ref.from) ? {} : { mark: "#".repeat(level) }),
        });
        for (const mark of children(ref.node, "HeaderMark")) hide(mark, true);
        return true;
      }

      switch (name) {
        case "StrongEmphasis":
        case "Emphasis":
        case "Strikethrough":
          for (const mark of children(ref.node, "EmphasisMark")) hide(mark);
          for (const mark of children(ref.node, "StrikethroughMark")) hide(mark);
          return true;

        case "InlineCode":
          for (const mark of children(ref.node, "CodeMark")) hide(mark);
          return true;

        case "Link": {
          // `[[wikilink]]`: the parser sees the inner brackets as a link of
          // its own. The pass below handles those, whole.
          const before = doc.sliceString(Math.max(0, ref.from - 1), ref.from);
          const after = doc.sliceString(ref.to, ref.to + 1);
          if (before === "[" || after === "]") return false;

          const marks = children(ref.node, "LinkMark");
          const open = marks[0];
          const close = marks[1];
          if (open && close && close.from > open.to && !awake(ref.from)) {
            out.push({ from: open.to, to: close.from, kind: "link" });
          }
          for (const mark of marks) hide(mark);
          for (const url of children(ref.node, "URL")) hide(url);
          for (const title of children(ref.node, "LinkTitle")) hide(title);
          return true;
        }

        case "QuoteMark": {
          hide(ref, true);
          const line = doc.lineAt(ref.from);
          out.push({
            from: line.from,
            to: line.from,
            kind: "quote",
            ...(awake(ref.from) ? {} : { mark: ">" }),
          });
          return true;
        }

        case "TaskMarker": {
          if (awake(ref.from)) return true;
          const box = doc.sliceString(ref.from, ref.to);
          out.push({
            from: ref.from,
            to: ref.to,
            kind: /[xX]/.test(box) ? "check-on" : "check-off",
          });
          return true;
        }

        default:
          return true;
      }
    },
  });

  // `==mark==` and `[[wikilinks]]` are not part of the GFM grammar, so they
  // are matched on the visible lines instead (spec §11 keeps both). Only
  // prose is searched: inside code, a link target or after a backslash the
  // characters are themselves (review #6).
  const literal = (start: number, end: number) =>
    guarded.some((range) => range.from < end && start < range.to);
  const firstLine = doc.lineAt(from).number;
  const lastLine = doc.lineAt(to).number;
  for (let n = firstLine; n <= lastLine; n += 1) {
    const line = doc.line(n);
    // Two cheap string checks before the syntax tree is asked anything: most
    // lines have neither, and this runs on every keystroke.
    const wiki = line.text.includes("[[");
    const highlight = line.text.includes("==");
    if ((!wiki && !highlight) || active.has(n) || inCode(state, line.from)) continue;
    if (wiki) for (const match of line.text.matchAll(WIKILINK)) {
      const at = line.from + (match.index ?? 0);
      if (literal(at, at + match[0].length)) continue;
      const alias = match[3];
      const label = alias ?? match[1] ?? "";
      const labelFrom = at + 2 + (alias ? (match[1] ?? "").length + 1 : 0);
      out.push({ from: at, to: labelFrom, kind: "hide" });
      out.push({ from: labelFrom, to: labelFrom + label.length, kind: "link" });
      out.push({ from: labelFrom + label.length, to: at + match[0].length, kind: "hide" });
    }
    if (highlight) for (const match of line.text.matchAll(HIGHLIGHT)) {
      const at = line.from + (match.index ?? 0);
      if (literal(at, at + match[0].length)) continue;
      const inner = match[1] ?? "";
      out.push({ from: at, to: at + 2, kind: "hide" });
      out.push({ from: at + 2, to: at + 2 + inner.length, kind: "highlight" });
      out.push({ from: at + 2 + inner.length, to: at + match[0].length, kind: "hide" });
    }
  }

  return out;
}

/* ------------------------------------------------------------ decorations */

class CheckWidget extends WidgetType {
  constructor(readonly on: boolean) {
    super();
  }
  eq(other: CheckWidget): boolean {
    return other.on === this.on;
  }
  toDOM(): HTMLElement {
    const box = document.createElement("span");
    box.className = "cm-rich-check";
    box.textContent = this.on ? "☑" : "☐";
    return box;
  }
  /** Clicks are ours (they tick the box), the rest is CodeMirror's. */
  ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown";
  }
}

const HIDDEN = Decoration.replace({});
const LINK = Decoration.mark({ class: "cm-rich-link" });
const MARK = Decoration.mark({ class: "cm-rich-mark" });
const CHECKED = Decoration.replace({ widget: new CheckWidget(true) });
const UNCHECKED = Decoration.replace({ widget: new CheckWidget(false) });

function decorationFor(range: RichRange): Decoration | null {
  switch (range.kind) {
    case "hide":
      return HIDDEN;
    case "link":
      return LINK;
    case "highlight":
      return MARK;
    case "check-on":
      return CHECKED;
    case "check-off":
      return UNCHECKED;
    case "heading":
      return Decoration.line({
        class: `cm-rich-head cm-rich-h${range.level ?? 1}`,
        ...(range.mark ? { attributes: { "data-mark": range.mark } } : {}),
      });
    case "quote":
      return Decoration.line({
        class: "cm-rich-quote",
        ...(range.mark ? { attributes: { "data-mark": range.mark } } : {}),
      });
    default:
      return null;
  }
}

function build(view: EditorView): DecorationSet {
  const active = activeLines(view.state);
  const ranges: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    for (const item of richRanges(view.state, from, to, active)) {
      const decoration = decorationFor(item);
      if (decoration) ranges.push(decoration.range(item.from, item.to));
    }
  }
  return Decoration.set(ranges, true);
}

const richPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = build(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** The `☐` glyph is a button: clicking it ticks the box on that line. */
const checkClicks = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = event.target as HTMLElement | null;
    if (!target?.closest(".cm-rich-check")) return false;
    const pos = view.posAtDOM(target);
    if (!toggleCheckboxAt(view, pos)) return false;
    event.preventDefault();
    return true;
  },
});

export const richExtension: Extension = [richPlugin, checkClicks];
