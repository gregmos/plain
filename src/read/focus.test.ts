import { describe, expect, it } from "vitest";
import { canTakeFocus } from "./ReadView";

const nothing = { dialog: false, quickSearch: false };

// Review #5: `Ctrl+Alt+1` from under an open dialog switches the mode behind
// it, and the reading pane used to take the focus away from the dialog's
// buttons on mount — the keys then went nowhere.
describe("canTakeFocus", () => {
  it("takes the keyboard when nothing else wants it", () => {
    expect(canTakeFocus(nothing, false)).toBe(true);
  });

  it("leaves it alone while a modal is up", () => {
    expect(canTakeFocus({ dialog: true, quickSearch: false }, false)).toBe(false);
  });

  it("leaves it alone while the palette is up", () => {
    expect(canTakeFocus({ dialog: false, quickSearch: true }, false)).toBe(false);
  });

  it("leaves it alone when something already holds it", () => {
    expect(canTakeFocus(nothing, true)).toBe(false);
  });
});
