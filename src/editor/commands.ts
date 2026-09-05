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

const FENCE = /^\s{0,3}(```|~~~)/;

/** Nobody has a code block this long, and huge files must not be scanned. */
const FENCE_SEARCH = 500;

/** Nearest fence line above `number`, or 0 — the line the block opens with. */
function fenceAbove(state: EditorState, number: number): number {
  const stop = Math.max(1, number - FENCE_SEARCH);
  for (let n = number - 1; n >= stop; n -= 1) {
    if (FENCE.test(state.doc.line(n).text)) return n;
  }
  return 0;
}

/** Nearest fence line below, or 0. */
function fenceBelow(state: EditorState, number: number): number {
  const stop = Math.min(state.doc.lines, number + FENCE_SEARCH);
  for (let n = number + 1; n <= stop; n += 1) {
    if (FENCE.test(state.doc.line(n).text)) return n;
  }
  return 0;
}

/** Takes a whole line out, with the line break that joins it to its neighbour. */
function dropLine(state: EditorState, line: Line): ChangeSpec {
  return line.to === state.doc.length
    ? { from: Math.max(0, line.from - 1), to: line.to }
    : { from: line.from, to: line.to + 1 };
}

/**
 * Fences each run of selected lines, or — when the selection sits inside a
 * block already — takes that block's fences off. Twice in a row leaves the
 * document as it was (review #3).
 */
export const toggleCodeBlock: StateCommand = editing(({ state, dispatch }) => {
  const groups = lineGroups(state);
  if (groups.length === 0) return false;
  const changes: ChangeSpec[] = [];

  for (const group of groups) {
    const first = group[0];
    const last = group[group.length - 1];
    if (!first || !last) continue;

    // The selection covers the fences themselves.
    if (group.length >= 2 && FENCE.test(first.text) && FENCE.test(last.text)) {
      // Two fences with nothing between them: one removal, or the two ranges
      // would overlap on the line break they share.
      if (last.number === first.number + 1) {
        changes.push({ from: first.from, to: Math.min(last.to + 1, state.doc.length) });
      } else {
        changes.push(dropLine(state, first), dropLine(state, last));
      }
      continue;
    }
    const open = fenceAbove(state, first.number);
    const close = fenceBelow(state, last.number);
    if (open > 0 && close > 0) {
      changes.push(dropLine(state, state.doc.line(open)), dropLine(state, state.doc.line(close)));
      continue;
    }
    changes.push(
      { from: first.from, insert: "```" + state.lineBreak },
      { from: last.to, insert: state.lineBreak + "```" },
    );
  }

  if (changes.length === 0) return false;
  dispatch(state.update({ changes, userEvent: "input", scrollIntoView: true }));
  return true;
});

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

/** `-` -> `1.` -> `- [ ]` -> nothing (spec §5.2). */
export const cycleList: StateCommand = editing(({ state, dispatch }) => {
  const lines = selectedLines(state).filter((l) => l.text.trim() !== "");
  const first = lines[0];
  if (!first) return false;

  const next = NEXT[listKind(first.text)];
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
  if (changes.length === 0) return false;
  dispatch(state.update({ changes, userEvent: "input", scrollIntoView: true }));
  return true;
});

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
