// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { focusEditor } from "./index";
import { GOTO_LINE } from "../read/events";

/**
 * Review #7: the tree's rename field borrows the focus and has to give it
 * back. It used to do that by asking for line 1, which also moved the caret
 * and the scroll of a document the user had been reading.
 */
describe("focusEditor", () => {
  it("says so, rather than throwing, when no editor is mounted", () => {
    expect(focusEditor()).toBe(false);
  });

  it("never asks for a jump — a jump would move the caret and the scroll", () => {
    const jumped = vi.fn();
    window.addEventListener(GOTO_LINE, jumped);
    focusEditor();
    window.removeEventListener(GOTO_LINE, jumped);
    expect(jumped).not.toHaveBeenCalled();
  });
});
