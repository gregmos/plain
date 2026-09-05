// macOS behaviour without a Mac (spec §13a): the platform is forced and the
// same code paths are exercised. Everything here is a pure function.

import { afterEach, describe, expect, it } from "vitest";
import { chordText, matchesChord, parseChord } from "./chords";
import { isMac, primaryModifierLabel, setMacForTests } from "./platform";
import { applyMacChords, command, macOverrides } from "./registry";
import { defaultEol } from "./settings";

// Back to the suite-wide default, not to detection: the next test must not
// depend on which machine is running it.
afterEach(() => setMacForTests(false));

function press(over: Partial<Record<string, unknown>> & { code: string }) {
  return {
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...over,
  } as { code: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean };
}

describe("the platform switch", () => {
  it("can be forced either way and handed back", () => {
    setMacForTests(true);
    expect(isMac()).toBe(true);
    expect(primaryModifierLabel()).toBe("⌘");
    setMacForTests(false);
    expect(isMac()).toBe(false);
    expect(primaryModifierLabel()).toBe("ctrl");
  });
});

describe("chords on macOS", () => {
  it("reads `Ctrl` as ⌘ and refuses the real control key", () => {
    setMacForTests(true);
    expect(matchesChord("Ctrl+B", press({ code: "KeyB", metaKey: true }))).toBe(true);
    // ⌘B is not ⌃B: the modifiers have to match exactly (spec §12).
    expect(matchesChord("Ctrl+B", press({ code: "KeyB", ctrlKey: true }))).toBe(false);
    expect(matchesChord("Ctrl+B", press({ code: "KeyB", metaKey: true, ctrlKey: true }))).toBe(
      false,
    );
  });

  it("keeps `Ctrl` as the control key on Windows", () => {
    setMacForTests(false);
    expect(matchesChord("Ctrl+B", press({ code: "KeyB", ctrlKey: true }))).toBe(true);
    expect(matchesChord("Ctrl+B", press({ code: "KeyB", metaKey: true }))).toBe(false);
  });

  it("has a token for the real control key, on both platforms", () => {
    setMacForTests(true);
    expect(matchesChord("Control+Cmd+F", press({ code: "KeyF", ctrlKey: true, metaKey: true }))).toBe(
      true,
    );
    expect(parseChord("Control+F")).toMatchObject({ ctrl: true, meta: false });
    setMacForTests(false);
    expect(parseChord("Control+F")).toMatchObject({ ctrl: true, meta: false });
  });

  it("leaves Alt alone — it is ⌥ and matches as alt", () => {
    setMacForTests(true);
    expect(matchesChord("Ctrl+Alt+Left", press({ code: "ArrowLeft", metaKey: true, altKey: true })))
      .toBe(true);
  });
});

describe("how a chord is written", () => {
  it("spells it out on Windows", () => {
    setMacForTests(false);
    expect(chordText("Ctrl+Shift+S")).toBe("ctrl shift s");
    expect(chordText("F11")).toBe("f11");
  });

  it("uses Apple's glyphs, in Apple's order, with nothing between", () => {
    setMacForTests(true);
    expect(chordText("Ctrl+Shift+S")).toBe("⇧⌘S");
    expect(chordText("Ctrl+Alt+Left")).toBe("⌥⌘←");
    expect(chordText("Control+Cmd+F")).toBe("⌃⌘F");
    expect(chordText("Ctrl+,")).toBe("⌘,");
    expect(chordText("Ctrl+1")).toBe("⌘1");
    expect(chordText("F1")).toBe("F1");
  });
});

describe("defaults that follow the platform", () => {
  it("writes LF on macOS and CRLF on Windows", () => {
    setMacForTests(true);
    expect(defaultEol()).toBe("lf");
    setMacForTests(false);
    expect(defaultEol()).toBe("crlf");
  });
});

describe("macOverrides", () => {
  it("moves history off the arrow keys macOS uses for words", () => {
    expect(macOverrides["nav.back"]).toBe("Ctrl+Alt+Left");
    expect(macOverrides["nav.forward"]).toBe("Ctrl+Alt+Right");
    setMacForTests(true);
    expect(chordText(macOverrides["nav.back"] as string)).toBe("⌥⌘←");
  });

  it("gives fullscreen the system chord, with the real control key", () => {
    expect(macOverrides["view.fullscreen"]).toBe("Control+Cmd+F");
    setMacForTests(true);
    expect(chordText(macOverrides["view.fullscreen"] as string)).toBe("⌃⌘F");
  });

  it("rewrites exactly the commands in the table and no others", () => {
    const list = [
      { id: "nav.back", title: "back", chord: "Alt+Left", run: () => {} },
      { id: "file.save", title: "save", chord: "Ctrl+S", run: () => {} },
    ];
    applyMacChords(list);
    expect(list[0]?.chord).toBe("Ctrl+Alt+Left");
    expect(list[1]?.chord).toBe("Ctrl+S");
  });

  it("leaves the registry on Windows chords when this is not a Mac", () => {
    // The suite runs as Windows (vitest.setup.ts), so the load-time
    // application must not have fired.
    expect(command("nav.back")?.chord).toBe("Alt+Left");
    expect(command("view.fullscreen")?.chord).toBe("F11");
  });
});
