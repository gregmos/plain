// Markdown formatting commands (spec §5.2). All of them are plain text
// operations over the selection or the line; applying one twice undoes it.

import { indentMore } from "@codemirror/commands";
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type Line,
  type StateCommand,
} from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import type { Command } from "@codemirror/view";

/** Every line touched by the selection, once, in document order. */
export function selectedLines(state: EditorState): Line[] {
  const lines: Line[] = [];
  let seen = 0;
  for (const range of state.selection.ranges) {
    let pos = range.from;
    for (;;) {
      const line = state.doc.lineAt(pos);
      if (line.number > seen) {
        lines.push(line);
        seen = line.number;
      }
      if (line.to >= range.to) break;
      pos = line.to + 1;
    }
  }
  return lines;
}

/* ---------------------------------------------------------------- inline */

const BOLD = "**";
const ITALIC = "*";
const CODE = "`";

/** True when a `*` next to the range is really half of a `**`. */
function partOfBold(state: EditorState, from: number, to: number): boolean {
  return (
    state.sliceDoc(Math.max(0, from - 2), Math.max(0, from - 1)) === "*" ||
    state.sliceDoc(Math.min(state.doc.length, to + 1), Math.min(state.doc.length, to + 2)) === "*"
  );
}

function toggleInline(mark: string): StateCommand {
  const n = mark.length;
  return ({ state, dispatch }) => {
    const tr = state.changeByRange((range) => {
      const inner = state.sliceDoc(range.from, range.to);
      const before = state.sliceDoc(Math.max(0, range.from - n), range.from);
      const after = state.sliceDoc(range.to, Math.min(state.doc.length, range.to + n));
      const bold = mark === ITALIC && partOfBold(state, range.from, range.to);

      // Marks sit just outside the selection: take them off.
      if (before === mark && after === mark && !bold) {
        return {
          changes: [
            { from: range.from - n, to: range.from },
            { from: range.to, to: range.to + n },
          ],
          range: EditorSelection.range(range.from - n, range.to - n),
        };
      }
      // Marks are inside the selection: take them off.
      if (
        inner.length >= 2 * n &&
        inner.startsWith(mark) &&
        inner.endsWith(mark) &&
        !(mark === ITALIC && inner.startsWith(BOLD))
      ) {
        return {
          changes: [
            { from: range.from, to: range.from + n },
            { from: range.to - n, to: range.to },
          ],
          range: EditorSelection.range(range.from, range.to - 2 * n),
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
  };
}

export const toggleBold = toggleInline(BOLD);
export const toggleItalic = toggleInline(ITALIC);
export const toggleInlineCode = toggleInline(CODE);

/** `[selection](  )` with the caret where the url goes. */
export const insertLink: StateCommand = ({ state, dispatch }) => {
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
};

/* ------------------------------------------------------------------ line */

const FENCE = /^\s*(```|~~~)/;

/** Wraps the selected lines in a fence, or unwraps one it is already in. */
export const toggleCodeBlock: StateCommand = ({ state, dispatch }) => {
  const lines = selectedLines(state);
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (!first || !last) return false;

  const changes: ChangeSpec[] =
    lines.length >= 3 && FENCE.test(first.text) && FENCE.test(last.text)
      ? [
          { from: first.from, to: Math.min(first.to + 1, state.doc.length) },
          { from: Math.max(0, last.from - 1), to: last.to },
        ]
      : [
          { from: first.from, insert: "```" + state.lineBreak },
          { from: last.to, insert: state.lineBreak + "```" },
        ];
  dispatch(state.update({ changes, userEvent: "input", scrollIntoView: true }));
  return true;
};

/** `> ` on every selected line, or off every selected line. */
export const toggleQuote: StateCommand = ({ state, dispatch }) => {
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
};

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
export const cycleList: StateCommand = ({ state, dispatch }) => {
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
};

/** Ctrl+Enter: tick or untick, adding the checkbox when there is none. */
export const toggleCheckbox: StateCommand = ({ state, dispatch }) => {
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
};

/** `#` * level on every selected line; the same level again takes it off. */
export function toggleHeading(level: number): StateCommand {
  const prefix = "#".repeat(level) + " ";
  return ({ state, dispatch }) => {
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
  };
}

/* ------------------------------------------------------------------- tab */

/**
 * Tab nests the item when the caret sits in the markup at the start of a
 * line, and inserts one indent unit anywhere else (spec §5.2).
 */
export const tabIndent: Command = (view) => {
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
};

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
