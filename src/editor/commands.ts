// Markdown formatting commands (spec §5.2). All of them are plain text
// operations over the selection or the line; applying one twice undoes it.

import { indentMore } from "@codemirror/commands";
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type Line,
  type StateCommand,
  type TransactionSpec,
} from "@codemirror/state";
import { indentUnit, syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import type { Command, EditorView } from "@codemirror/view";

/** Every line touched by the selection, once, in document order. */
export function selectedLines(state: EditorState): Line[] {
  const lines: Line[] = [];
  let seen = 0;
  for (const range of state.selection.ranges) {
    // A selection that ends at a line start does not reach into that line.
    const end = range.empty ? range.to : Math.max(range.from, range.to - 1);
    let pos = range.from;
    for (;;) {
      const line = state.doc.lineAt(pos);
      if (line.number > seen) {
        lines.push(line);
        seen = line.number;
      }
      if (line.to >= end) break;
      pos = line.to + 1;
    }
  }
  return lines;
}

/** The same lines, split into the runs that touch each other. */
function lineGroups(state: EditorState): Line[][] {
  const groups: Line[][] = [];
  for (const line of selectedLines(state)) {
    const last = groups[groups.length - 1];
    const previous = last?.[last.length - 1];
    if (last && previous && previous.number === line.number - 1) last.push(line);
    else groups.push([line]);
  }
  return groups;
}

/**
 * A read-only document stays read-only (spec §8): CodeMirror only blocks
 * typing, so every command of ours goes through this — chords, menu and the
 * floating panel all end up here.
 */
function editing<T extends { state: EditorState }>(
  command: (target: T) => boolean,
): (target: T) => boolean {
  return (target) => (target.state.readOnly ? false : command(target));
}

/* ---------------------------------------------------------------- inline */

const BOLD = "**";
const ITALIC = "*";
const CODE = "`";
const STRIKE = "~~";

/** How many `ch` in a row sit at `pos`, walking in `dir`. */
function run(text: string, pos: number, dir: -1 | 1, ch: string): number {
  let n = 0;
  for (let at = dir < 0 ? pos - 1 : pos; at >= 0 && at < text.length; at += dir) {
    if (text[at] !== ch) break;
    n += 1;
  }
  return n;
}

/**
 * How many characters of `mark` to take off each side of the run of stars
 * around the selection. `**` needs two of them, `*` needs the run to be odd —
 * that is what tells `*a*` from `**a**` and `***a***` apart.
 */
function starsToStrip(mark: string, before: number, after: number): number {
  const pair = Math.min(before, after);
  if (mark === BOLD) return pair >= 2 ? 2 : 0;
  return pair % 2 === 1 ? 1 : 0;
}

/** Marks just outside the range, if the range is wrapped in them. */
function outsideStrip(state: EditorState, from: number, to: number, mark: string): number {
  if (mark === BOLD || mark === ITALIC) {
    // A window: nobody writes six stars in a row on purpose.
    const left = state.sliceDoc(Math.max(0, from - 6), from);
    const right = state.sliceDoc(to, Math.min(state.doc.length, to + 6));
    return starsToStrip(mark, run(left, left.length, -1, "*"), run(right, 0, 1, "*"));
  }
  const n = mark.length;
  const before = state.sliceDoc(Math.max(0, from - n), from);
  const after = state.sliceDoc(to, Math.min(state.doc.length, to + n));
  return before === mark && after === mark ? n : 0;
}

/** The same, for marks the selection itself starts and ends with. */
function insideStrip(inner: string, mark: string): number {
  const width =
    mark === BOLD || mark === ITALIC
      ? starsToStrip(mark, run(inner, 0, 1, "*"), run(inner, inner.length, -1, "*"))
      : inner.startsWith(mark) && inner.endsWith(mark)
        ? mark.length
        : 0;
  // `**` on its own is one pair of marks, not two.
  return inner.length >= 2 * width ? width : 0;
}

function toggleInline(mark: string): StateCommand {
  const n = mark.length;
  return editing(({ state, dispatch }) => {
    const tr = state.changeByRange((range) => {
      const outside = outsideStrip(state, range.from, range.to, mark);
      if (outside > 0) {
        return {
          changes: [
            { from: range.from - outside, to: range.from },
            { from: range.to, to: range.to + outside },
          ],
          range: EditorSelection.range(range.from - outside, range.to - outside),
        };
      }
      const inner = state.sliceDoc(range.from, range.to);
      const inside = insideStrip(inner, mark);
      if (inside > 0) {
        return {
          changes: [
            { from: range.from, to: range.from + inside },
            { from: range.to - inside, to: range.to },
          ],
          range: EditorSelection.range(range.from, range.to - 2 * inside),
        };
      }
      return {
        changes: { from: range.from, to: range.to, insert: mark + inner + mark },
        range: range.empty
          ? EditorSelection.cursor(range.from + n)
          : EditorSelection.range(range.from + n, range.to + n),
      };
    });
    dispatch(state.update(tr, { userEvent: "input", scrollIntoView: true }));
    return true;
  });
}

export const toggleBold = toggleInline(BOLD);
export const toggleItalic = toggleInline(ITALIC);
export const toggleInlineCode = toggleInline(CODE);
/** GFM `~~strike~~`; no chord, it only exists on the floating panel (§5.2). */
export const toggleStrike = toggleInline(STRIKE);

/** `[selection](  )` with the caret where the url goes. */
export const insertLink: StateCommand = editing(({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    const insert = `[${text}]()`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(
        range.empty ? range.from + 1 : range.from + insert.length - 1,
      ),
    };
  });
  dispatch(state.update(tr, { userEvent: "input", scrollIntoView: true }));
  return true;
});

/* ------------------------------------------------------------------ line */

const FENCE = /^\s{0,3}(`{3,}|~{3,}|\${2})/;

/** Nobody has a code block this long, and huge files must not be scanned. */
const FENCE_SEARCH = 500;

interface Fence {
  /** The character the fence is made of: a backtick, a tilde, a dollar. */
  char: string;
  length: number;
  line: number;
}

function fenceAt(state: EditorState, n: number): Fence | null {
  const match = FENCE.exec(state.doc.line(n).text);
  const delimiter = match?.[1];
  if (!delimiter) return null;
  return { char: delimiter[0] ?? "", length: delimiter.length, line: n };
}

/**
 * The fenced block a line is inside, if the fences are the kind we were
 * asked about. Blocks are paired from the top of a window, so a fence that
 * closes someone else's block is not mistaken for one that opens ours, and a
 * `$$` command never takes a ``` block apart (review #2).
 */
type Enclosing =
  | { kind: "none" }
  | { kind: "other" }
  | { kind: "match"; open: Fence; close: Fence };

function enclosing(state: EditorState, line: number, want: string): Enclosing {
  const from = Math.max(1, line - FENCE_SEARCH);
  const to = Math.min(state.doc.lines, line + FENCE_SEARCH);
  let open: Fence | null = null;

  for (let n = from; n <= to; n += 1) {
    const fence = fenceAt(state, n);
    if (!fence) continue;
    if (!open) {
      open = fence;
      continue;
    }
    // A closer is the same character, at least as long (CommonMark).
    if (fence.char === open.char && fence.length >= open.length) {
      if (open.line <= line && line <= fence.line) {
        return open.char === want[0] ? { kind: "match", open, close: fence } : { kind: "other" };
      }
      open = null;
      continue;
    }
  }
  return { kind: "none" };
}

/** Takes a whole line out, with the line break that joins it to its neighbour. */
function dropLine(state: EditorState, line: Line): ChangeSpec {
  return line.to === state.doc.length
    ? { from: Math.max(0, line.from - 1), to: line.to }
    : { from: line.from, to: line.to + 1 };
}

/**
 * Fences each run of selected lines, or — when the selection is already
 * inside a block of this kind — takes that block's fences off. Inside a block
 * of another kind it does nothing at all. Twice in a row leaves the document
 * as it was (review #2, #3).
 */
function toggleFence(fence: string): StateCommand {
  return editing(({ state, dispatch }) => {
    const groups = lineGroups(state);
    if (groups.length === 0) return false;
    const changes: ChangeSpec[] = [];
    const undone = new Set<number>();

    for (const group of groups) {
      const first = group[0];
      const last = group[group.length - 1];
      if (!first || !last) continue;

      const block = enclosing(state, first.number, fence);
      if (block.kind === "other") continue;
      if (block.kind === "match") {
        // Two selections in one block unwrap it once (review #2).
        if (undone.has(block.open.line)) continue;
        undone.add(block.open.line);
        const openLine = state.doc.line(block.open.line);
        const closeLine = state.doc.line(block.close.line);
        if (block.close.line === block.open.line + 1) {
          changes.push({ from: openLine.from, to: Math.min(closeLine.to + 1, state.doc.length) });
        } else {
          changes.push(dropLine(state, openLine), dropLine(state, closeLine));
        }
        continue;
      }
      changes.push(
        { from: first.from, insert: fence + state.lineBreak },
        { from: last.to, insert: state.lineBreak + fence },
      );
    }

    if (changes.length === 0) return false;
    dispatch(state.update({ changes, userEvent: "input", scrollIntoView: true }));
    return true;
  });
}

export const toggleCodeBlock = toggleFence("```");
/** `$$ … $$` on its own lines (spec §5.2, v2.6). */
export const toggleMathBlock = toggleFence("$$");

/** `> ` on every selected line, or off every selected line. */
export const toggleQuote: StateCommand = editing(({ state, dispatch }) => {
  const lines = selectedLines(state);
  if (lines.length === 0) return false;
  const quoted = lines.every((l) => /^\s*>/.test(l.text) || l.text.trim() === "");
  const changes: ChangeSpec[] = [];
  for (const line of lines) {
    if (quoted) {
      const m = /^(\s*)> ?/.exec(line.text);
      if (m) changes.push({ from: line.from + (m[1]?.length ?? 0), to: line.from + m[0].length });
    } else {
      const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
      changes.push({ from: line.from + indent, insert: "> " });
    }
  }
  if (changes.length === 0) return false;
  dispatch(state.update({ changes, userEvent: "input", scrollIntoView: true }));
  return true;
});

export type ListKind = "none" | "bullet" | "ordered" | "task";

const TASK = /^(\s*)[-*+] \[[ xX]\] /;
const BULLET = /^(\s*)[-*+] /;
const ORDERED = /^(\s*)\d+[.)] /;

export function listKind(text: string): ListKind {
  if (TASK.test(text)) return "task";
  if (BULLET.test(text)) return "bullet";
  if (ORDERED.test(text)) return "ordered";
  return "none";
}

const NEXT: Record<ListKind, ListKind> = {
  none: "bullet",
  bullet: "ordered",
  ordered: "task",
  task: "none",
};

/** Marker length of whatever list markup the line already carries. */
function markerLength(text: string): number {
  const m = TASK.exec(text) ?? BULLET.exec(text) ?? ORDERED.exec(text);
  return m ? m[0].length - (m[1]?.length ?? 0) : 0;
}

function listMarker(kind: ListKind, number: number): string {
  if (kind === "bullet") return "- ";
  if (kind === "ordered") return `${number}. `;
  return kind === "task" ? "- [ ] " : "";
}

/** Rewrites the markup of every selected line to one kind. */
function applyList(state: EditorState, next: ListKind): ChangeSpec[] {
  const lines = selectedLines(state).filter((l) => l.text.trim() !== "");
  const changes: ChangeSpec[] = [];
  let number = 1;
  for (const line of lines) {
    const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
    const from = line.from + indent;
    const to = from + markerLength(line.text);
    const marker =
      next === "bullet" ? "- " : next === "ordered" ? `${number++}. ` : next === "task" ? "- [ ] " : "";
    changes.push({ from, to, insert: marker });
  }
  return changes;
}

/** The lines a list command works on: the written ones, or the empty one. */
function listLines(state: EditorState): Line[] {
  const lines = selectedLines(state);
  const written = lines.filter((line) => line.text.trim() !== "");
  // An empty line is where a list usually starts (review #4).
  return written.length > 0 ? written : lines.slice(0, 1);
}

function listCommand(pick: (current: ListKind) => ListKind): StateCommand {
  return editing(({ state, dispatch }) => {
    const first = listLines(state)[0];
    if (!first) return false;
    const changes = applyList(state, pick(listKind(first.text)));
    if (changes.length === 0) return false;
    dispatch(state.update({ changes, userEvent: "input", scrollIntoView: true }));
    return true;
  });
}

/** `-` -> `1.` -> `- [ ]` -> nothing (spec §5.2). */
export const cycleList = listCommand((current) => NEXT[current]);

/**
 * One kind of list, on or off again (spec §5.2, v2.6). Lines that already
 * carry a different marker keep it: turning a paragraph into a list must not
 * quietly rewrite the numbered item next to it (review #4).
 */
function listToggle(kind: ListKind): StateCommand {
  return editing(({ state, dispatch }) => {
    const lines = listLines(state);
    if (lines.length === 0) return false;
    const off = lines.every((line) => listKind(line.text) === kind);
    const changes: ChangeSpec[] = [];
    let number = 1;
    for (const line of lines) {
      const current = listKind(line.text);
      if (!off && current !== "none" && current !== kind) continue;
      const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
      const from = line.from + indent;
      const to = from + markerLength(line.text);
      const marker = off ? "" : listMarker(kind, number++);
      if (from === to && marker === "") continue;
      changes.push({ from, to, insert: marker });
    }
    if (changes.length === 0) return false;
    const spec = state.changes(changes);
    dispatch(
      state.update({
        changes: spec,
        // After the marker, which is where the item is written.
        selection: state.selection.map(spec, 1),
        userEvent: "input",
        scrollIntoView: true,
      }),
    );
    return true;
  });
}

export const toggleBulletList = listToggle("bullet");
export const toggleOrderedList = listToggle("ordered");
export const toggleTaskList = listToggle("task");

/** Ctrl+Enter: tick or untick, adding the checkbox when there is none. */
export const toggleCheckbox: StateCommand = editing(({ state, dispatch }) => {
  const lines = selectedLines(state);
  if (lines.length === 0) return false;
  const changes: ChangeSpec[] = [];
  for (const line of lines) {
    const task = /^(\s*[-*+] )\[([ xX])\] /.exec(line.text);
    if (task) {
      const at = line.from + (task[1]?.length ?? 0) + 1;
      changes.push({ from: at, to: at + 1, insert: task[2] === " " ? "x" : " " });
      continue;
    }
    const bullet = BULLET.exec(line.text);
    if (bullet) {
      changes.push({ from: line.from + bullet[0].length, insert: "[ ] " });
      continue;
    }
    const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
    changes.push({ from: line.from + indent, insert: "- [ ] " });
  }
  if (changes.length === 0) return false;
  dispatch(state.update({ changes, userEvent: "input", scrollIntoView: true }));
  return true;
});

/**
 * Ticks the box on the line at `pos`, whoever asks — the rich view's glyph
 * is a click target, and it must not move the caret to do it (spec §5.3).
 */
export function toggleCheckboxAt(view: EditorView, pos: number): boolean {
  const { state } = view;
  if (state.readOnly) return false;
  const line = state.doc.lineAt(pos);

  // The parser knows a task marker wherever it sits — under an ordered item,
  // inside a quote, behind two spaces (review #7). The line regex is only the
  // fallback for a file too big to parse.
  let marker: { from: number; to: number } | null = null;
  syntaxTree(state).iterate({
    from: line.from,
    to: line.to,
    enter(ref) {
      if (ref.name !== "TaskMarker") return;
      if (!marker || (ref.from <= pos && pos <= ref.to)) {
        marker = { from: ref.from, to: ref.to };
      }
    },
  });
  const box: { from: number; to: number } | null =
    marker ?? fallbackTaskMarker(line.text, line.from);
  if (!box) return false;

  const at = box.from + 1;
  const ticked = /[xX]/.test(state.sliceDoc(at, at + 1));
  view.dispatch({
    changes: { from: at, to: at + 1, insert: ticked ? " " : "x" },
    userEvent: "input",
  });
  return true;
}

/** `[ ]` on a line, when there is no syntax tree to ask (spec §8). */
function fallbackTaskMarker(text: string, from: number): { from: number; to: number } | null {
  const match = /\[[ xX]\]/.exec(text);
  return match ? { from: from + match.index, to: from + match.index + 3 } : null;
}

/** `#` * level on every selected line; the same level again takes it off. */
export function toggleHeading(level: number): StateCommand {
  const prefix = "#".repeat(level) + " ";
  return editing(({ state, dispatch }) => {
    const lines = selectedLines(state);
    if (lines.length === 0) return false;
    const changes: ChangeSpec[] = [];
    for (const line of lines) {
      const m = /^(#{1,6}) +/.exec(line.text);
      const to = line.from + (m ? m[0].length : 0);
      if (m && m[1]?.length === level) changes.push({ from: line.from, to });
      else changes.push({ from: line.from, to, insert: prefix });
    }
    if (changes.length === 0) return false;
    dispatch(state.update({ changes, userEvent: "input", scrollIntoView: true }));
    return true;
  });
}

/** `heading → off` in the menu (spec §4): any `#` prefix comes off. */
export const clearHeading: StateCommand = editing(({ state, dispatch }) => {
  const changes: ChangeSpec[] = [];
  for (const line of selectedLines(state)) {
    const m = /^(#{1,6}) +/.exec(line.text);
    if (m) changes.push({ from: line.from, to: line.from + m[0].length });
  }
  if (changes.length === 0) return false;
  dispatch(state.update({ changes, userEvent: "input", scrollIntoView: true }));
  return true;
});

/* ------------------------------------------------------------------- tab */

/**
 * Tab nests the item when the caret sits in the markup at the start of a
 * line, and inserts one indent unit anywhere else (spec §5.2).
 */
export const tabIndent: Command = editing((view: EditorView) => {
  const { state } = view;
  if (state.selection.ranges.some((r) => !r.empty)) return indentMore(view);

  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const before = line.text.slice(0, head - line.from);
  if (/^\s*$/.test(before) || /^\s*([-*+]|\d+[.)])( \[[ xX]\])?\s*$/.test(before)) {
    return indentMore(view);
  }

  const unit = state.facet(indentUnit);
  const tr = state.changeByRange((range) => ({
    changes: { from: range.from, insert: unit },
    range: EditorSelection.cursor(range.from + unit.length),
  }));
  view.dispatch(state.update(tr, { userEvent: "input", scrollIntoView: true }));
  return true;
});

/* ----------------------------------------------------------------- paste */

/** One bare URL and nothing else. */
const URL_ONLY = /^(https?:\/\/|mailto:)\S+$/i;

/**
 * Pasting a URL over selected text makes a link instead of replacing it
 * (spec §5.2). Returns the transaction to run, or null to paste as usual.
 */
export function urlPaste(state: EditorState, pasted: string): TransactionSpec | null {
  if (state.readOnly) return null;
  const url = pasted.trim();
  if (!URL_ONLY.test(url)) return null;
  const main = state.selection.main;
  if (main.empty) return null;
  const text = state.sliceDoc(main.from, main.to);
  // Links do not span lines, and a selection already inside `[...]` would
  // only get nested brackets.
  if (text.includes("\n") || text.includes("]")) return null;
  const insert = `[${text}](${url})`;
  return {
    changes: { from: main.from, to: main.to, insert },
    selection: { anchor: main.from + insert.length },
    userEvent: "input.paste",
    scrollIntoView: true,
  };
}

/* ---------------------------------------------------------------- indent */

/** Indent width of the file itself, which wins over settings (spec §10). */
export function detectIndent(text: string, fallback: string): string {
  const lines = text.split(/\r\n|\r|\n/, 400);
  for (const line of lines) {
    if (/^\t/.test(line)) return "\t";
    const m = /^( +)\S/.exec(line);
    if (m) {
      const width = m[1]?.length ?? 0;
      if (width >= 2 && width <= 8) return " ".repeat(width);
    }
  }
  return fallback;
}


/* ------------------------------------------------------- insert (v2.6) */

/** True where markdown means what it says: not in code, not in a link target. */
export function isProse(state: EditorState, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); node; node = node.parent) {
    if (
      node.name === "InlineCode" ||
      node.name === "CodeText" ||
      node.name === "CodeMark" ||
      node.name === "FencedCode" ||
      node.name === "CodeBlock" ||
      node.name === "URL" ||
      node.name === "Autolink" ||
      node.name === "LinkTitle"
    ) {
      return false;
    }
  }
  return true;
}

/** `==highlight==`, but never inside code or a link target (review #11). */
export const toggleHighlight: StateCommand = editing((target) => {
  const { state } = target;
  if (state.selection.ranges.some((range) => !isProse(state, range.from))) return false;
  return toggleInline("==")(target);
});

/** `$…$` around the selection, or an empty pair to type into. */
export const toggleMathInline = toggleInline("$");

const WIKI_OPEN = "[[";
const WIKI_CLOSE = "]]";

/** `[[wikilink]]`; again takes one pair off (review #6). */
export const insertWikilink: StateCommand = editing(({ state, dispatch }) => {
  const tr = state.changeByRange((range) => {
    const inner = state.sliceDoc(range.from, range.to);
    const before = state.sliceDoc(Math.max(0, range.from - 2), range.from);
    const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + 2));

    if (before === WIKI_OPEN && after === WIKI_CLOSE) {
      return {
        changes: [
          { from: range.from - 2, to: range.from },
          { from: range.to, to: range.to + 2 },
        ],
        range: EditorSelection.range(range.from - 2, range.to - 2),
      };
    }
    if (inner.length >= 4 && inner.startsWith(WIKI_OPEN) && inner.endsWith(WIKI_CLOSE)) {
      return {
        changes: [
          { from: range.from, to: range.from + 2 },
          { from: range.to - 2, to: range.to },
        ],
        range: EditorSelection.range(range.from, range.to - 4),
      };
    }
    const insert = WIKI_OPEN + inner + WIKI_CLOSE;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: range.empty
        ? EditorSelection.cursor(range.from + 2)
        : EditorSelection.range(range.from + 2, range.to + 2),
    };
  });
  dispatch(state.update(tr, { userEvent: "input", scrollIntoView: true }));
  return true;
});

/* --------------------------------------------------------------- blocks */

/** `> ` (however deep) at the head of a line: a block there keeps it. */
function containerPrefix(text: string): string {
  return /^(\s*(?:>\s?)+)/.exec(text)?.[1] ?? "";
}

function isBlank(text: string, prefix: string): boolean {
  return text.slice(prefix.length).trim() === "";
}

/**
 * Where a whole block (a table, a rule) goes when the caret is on `line`, and
 * what it has to carry to stay inside its container (review #3, #7): after
 * the line it is on, one blank line apart, quoted if that line is quoted.
 */
function blockSpot(
  state: EditorState,
  line: Line,
): { at: number; prefix: string; before: string; after: string } {
  const prefix = containerPrefix(line.text);
  const blank = prefix.trimEnd();
  const nl = state.lineBreak;
  const below = line.number < state.doc.lines ? state.doc.line(line.number + 1) : null;
  const gapBelow = below && !isBlank(below.text, containerPrefix(below.text)) ? nl + blank + nl : nl;

  if (isBlank(line.text, prefix)) {
    const above = line.number > 1 ? state.doc.line(line.number - 1) : null;
    return {
      at: line.to,
      prefix,
      before: above && !isBlank(above.text, containerPrefix(above.text)) ? nl + blank + nl : "",
      after: gapBelow,
    };
  }
  // A line right above `---` would turn into a Setext heading (review #3).
  return { at: line.to, prefix, before: nl + blank + nl, after: gapBelow };
}

/** One entry per line the selection starts on, in order. */
function caretLines(state: EditorState): Line[] {
  const seen = new Set<number>();
  const lines: Line[] = [];
  for (const range of state.selection.ranges) {
    const line = state.doc.lineAt(range.from);
    if (seen.has(line.number)) continue;
    seen.add(line.number);
    lines.push(line);
  }
  return lines;
}

/** `---` alone, with a blank line on either side (spec §5.2, review #3). */
export const insertRule: StateCommand = editing(({ state, dispatch }) => {
  const changes: ChangeSpec[] = [];
  let first = -1;
  for (const line of caretLines(state)) {
    const spot = blockSpot(state, line);
    if (first < 0) first = spot.at;
    changes.push({ from: spot.at, insert: spot.before + spot.prefix + "---" + spot.after });
  }
  if (changes.length === 0) return false;
  const spec = state.changes(changes);
  dispatch(
    state.update({
      changes: spec,
      // Below the rule, where the writing goes on.
      selection: EditorSelection.cursor(spec.mapPos(first, 1)),
      userEvent: "input",
      scrollIntoView: true,
    }),
  );
  return true;
});

const TABLE = ["| a | b | c |", "|---|---|---|", "|   |   |   |"];

/** A 3x3 table after the caret's line, the caret on the first header cell. */
export const insertTable: StateCommand = editing(({ state, dispatch }) => {
  const changes: ChangeSpec[] = [];
  let caretAt = -1;
  for (const line of caretLines(state)) {
    const spot = blockSpot(state, line);
    const body = TABLE.map((row) => spot.prefix + row).join(state.lineBreak);
    if (caretAt < 0) caretAt = spot.at + spot.before.length + spot.prefix.length + 2;
    changes.push({ from: spot.at, insert: spot.before + body + spot.after });
  }
  if (changes.length === 0) return false;
  dispatch(
    state.update({
      changes,
      // On `a`, so typing names the first column.
      selection: EditorSelection.cursor(caretAt),
      userEvent: "input",
      scrollIntoView: true,
    }),
  );
  return true;
});

/**
 * The next footnote number: one past the highest the document already uses.
 * Gaps are not filled — `[^2]` after `[^1] [^3]` would read as a repeat of
 * something deleted. Numbers inside code, or escaped as `\[^1]`, are text
 * rather than references (review #8).
 */
export function nextFootnote(text: string): number {
  const prose = text
    .replace(/^ {0,3}(```|~~~)[\s\S]*?^ {0,3}\1/gm, "")
    .replace(/`[^`\n]*`/g, "")
    .replace(/\\\[\^/g, "");
  let top = 0;
  for (const match of prose.matchAll(/\[\^(\d+)\]/g)) {
    top = Math.max(top, Number(match[1] ?? 0));
  }
  return top + 1;
}

/**
 * `[^n]` where the caret is and `[^n]: ` at the end of the document, with the
 * caret in the first definition — which is where the text goes. Every cursor
 * gets its own number (review #1, #7).
 */
export const insertFootnote: StateCommand = editing(({ state, dispatch }) => {
  const text = state.doc.toString();
  const end = state.doc.length;
  const nl = state.lineBreak;
  let label = nextFootnote(text);

  const changes: ChangeSpec[] = [];
  const definitions: string[] = [];
  for (const range of state.selection.ranges) {
    // After what is selected, not instead of it: the reference follows the
    // words it belongs to (review #1).
    changes.push({ from: range.to, insert: `[^${label}]` });
    definitions.push(`[^${label}]: `);
    label += 1;
  }
  const tail = text.endsWith("\n\n") ? "" : text.endsWith("\n") ? nl : nl + nl;
  const joined = definitions.join(nl);
  changes.push({ from: end, insert: tail + joined });

  // Everything shifts when the marks go in, so the caret is mapped, not
  // counted from the old document (review #1).
  const spec = state.changes(changes);
  const at = spec.newLength - (joined.length - (definitions[0]?.length ?? 0));
  dispatch(
    state.update({
      changes: spec,
      selection: EditorSelection.cursor(at),
      userEvent: "input",
      scrollIntoView: true,
    }),
  );
  return true;
});

export const CALLOUT_TYPES = ["note", "tip", "important", "warning", "caution"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

const CALLOUT_MARK = /^(\s*>\s*)\[!(\w+)\]\s*$/;

/** The callout a line belongs to: up through the quoted lines to its marker. */
function calloutOf(state: EditorState, line: Line): { marker: Line; type: string } | null {
  for (let n = line.number; n >= 1; n -= 1) {
    const current = state.doc.line(n);
    const marked = CALLOUT_MARK.exec(current.text);
    if (marked) return { marker: current, type: (marked[2] ?? "").toLowerCase() };
    if (!/^\s*>/.test(current.text)) return null;
  }
  return null;
}

/**
 * `> [!NOTE]` above the selected lines, quoted. Inside a callout of the same
 * type it comes off; inside one of another type only the marker changes
 * (review #5). Separate runs of lines are separate callouts.
 */
export function toggleCallout(type: CalloutType): StateCommand {
  return editing(({ state, dispatch }) => {
    const changes: ChangeSpec[] = [];
    const handled = new Set<number>();

    for (const group of lineGroups(state)) {
      const first = group[0];
      if (!first) continue;
      const callout = calloutOf(state, first);
      if (callout) {
        if (handled.has(callout.marker.number)) continue;
        handled.add(callout.marker.number);
      }

      if (callout && callout.type === type) {
        changes.push(dropLine(state, callout.marker));
        for (const line of group) {
          if (line.number === callout.marker.number) continue;
          const quoted = /^(\s*)> ?/.exec(line.text);
          if (quoted) {
            changes.push({
              from: line.from + (quoted[1]?.length ?? 0),
              to: line.from + quoted[0].length,
            });
          }
        }
      } else if (callout) {
        // Another type: only the label changes, the quoting stays.
        const marked = CALLOUT_MARK.exec(callout.marker.text);
        const lead = (marked?.[1] ?? "> ").length;
        changes.push({
          from: callout.marker.from + lead,
          to: callout.marker.to,
          insert: `[!${type.toUpperCase()}]`,
        });
      } else {
        changes.push({ from: first.from, insert: `> [!${type.toUpperCase()}]${state.lineBreak}` });
        for (const line of group) changes.push({ from: line.from, insert: "> " });
      }
    }

    if (changes.length === 0) return false;
    dispatch(state.update({ changes, userEvent: "input", scrollIntoView: true }));
    return true;
  });
}
