import { describe, expect, it } from "vitest";
import { chordToPattern, matchesChord, type KeyLike } from "./chords";

function key(code: string, mods: Partial<KeyLike> = {}): KeyLike {
  return { code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods };
}

describe("chordToPattern", () => {
  it("maps letters, digits and punctuation to physical codes", () => {
    expect(chordToPattern("Ctrl+Shift+F")).toBe("Control+Shift+KeyF");
    expect(chordToPattern("Ctrl+Alt+1")).toBe("Control+Alt+Digit1");
    expect(chordToPattern("Ctrl+\\")).toBe("Control+Backslash");
    expect(chordToPattern("Ctrl+/")).toBe("Control+Slash");
    expect(chordToPattern("Ctrl+[")).toBe("Control+BracketLeft");
    expect(chordToPattern("F11")).toBe("F11");
    expect(chordToPattern("Ctrl+Tab")).toBe("Control+Tab");
  });
});

describe("matchesChord", () => {
  it("matches by code, so a Russian layout still triggers Ctrl+B", () => {
    // Ctrl+B on a Russian layout: event.key is "и", event.code is "KeyB".
    expect(matchesChord("Ctrl+B", key("KeyB", { ctrlKey: true }))).toBe(true);
  });

  it("requires the modifiers to match exactly", () => {
    expect(matchesChord("Ctrl+F", key("KeyF", { ctrlKey: true }))).toBe(true);
    expect(matchesChord("Ctrl+F", key("KeyF", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(matchesChord("Ctrl+F", key("KeyF"))).toBe(false);
    expect(matchesChord("F5", key("F5"))).toBe(true);
    expect(matchesChord("F5", key("F5", { altKey: true }))).toBe(false);
  });
});
