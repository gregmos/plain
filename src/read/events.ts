// Three window events tie read, edit and the rail together without either
// side importing the other (spec §5.0).

/** Put the caret on this 1-based source line. Handled by the editor. */
export const GOTO_LINE = "plain:goto-line";
/** Scroll the rendered document to this heading id. Handled by read. */
export const GOTO_HEADING = "plain:goto-heading";
/** F5: build the document again. */
export const RERENDER = "plain:rerender";

export function emitGotoLine(line: number): void {
  window.dispatchEvent(new CustomEvent(GOTO_LINE, { detail: line }));
}

export function emitGotoHeading(id: string): void {
  window.dispatchEvent(new CustomEvent(GOTO_HEADING, { detail: id }));
}

export function emitRerender(): void {
  window.dispatchEvent(new CustomEvent(RERENDER));
}
