// Window events tie read, edit and the rail together without either side
// importing the other (spec §5.0). Wave 5 added the find group: the command
// registry owns the chords, whichever view is mounted answers.

/** Put the caret on this 1-based source line. Handled by the editor. */
export const GOTO_LINE = "plain:goto-line";
/** Scroll the rendered document to this heading id. Handled by read. */
export const GOTO_HEADING = "plain:goto-heading";
/** F5: build the document again. */
export const RERENDER = "plain:rerender";
/** `Ctrl+F` — read opens its own bar, edit opens the CodeMirror panel. */
export const FIND = "plain:find";
/** `Ctrl+H` — edit only; read answers it by switching to edit (spec §5.1). */
export const REPLACE = "plain:replace";
/** `F3` / `Shift+F3`; the detail is the direction. */
export const FIND_STEP = "plain:find-step";
/** `Ctrl+G` — edit only. */
export const GOTO_LINE_PROMPT = "plain:goto-line-prompt";

export function emitGotoLine(line: number): void {
  window.dispatchEvent(new CustomEvent(GOTO_LINE, { detail: line }));
}

export function emitGotoHeading(id: string): void {
  window.dispatchEvent(new CustomEvent(GOTO_HEADING, { detail: id }));
}

export function emitRerender(): void {
  window.dispatchEvent(new CustomEvent(RERENDER));
}

export function emitFind(): void {
  window.dispatchEvent(new CustomEvent(FIND));
}

export function emitReplace(): void {
  window.dispatchEvent(new CustomEvent(REPLACE));
}

export function emitFindStep(direction: 1 | -1): void {
  window.dispatchEvent(new CustomEvent(FIND_STEP, { detail: direction }));
}

export function emitGotoLinePrompt(): void {
  window.dispatchEvent(new CustomEvent(GOTO_LINE_PROMPT));
}
