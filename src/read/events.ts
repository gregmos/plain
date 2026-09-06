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
/**
 * "Open the replace panel." Sent by read when `Ctrl+H` switches to edit: the
 * editor is not mounted yet at that moment, so the editor parks this the way
 * it parks a goto-line and answers it on its first mount (audit #5).
 */
export const OPEN_REPLACE = "plain:open-replace";

export function emitGotoLine(line: number): void {
  window.dispatchEvent(new CustomEvent(GOTO_LINE, { detail: line }));
}

/**
 * The same jump without the caret: read → edit lands on the heading that was
 * on screen, but whatever was selected in edit stays selected (review #7).
 */
export function emitScrollToLine(line: number): void {
  window.dispatchEvent(new CustomEvent(GOTO_LINE, { detail: { line, moveCaret: false } }));
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

export function emitOpenReplace(): void {
  window.dispatchEvent(new CustomEvent(OPEN_REPLACE));
}
