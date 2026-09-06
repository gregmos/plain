// macOS behaviour without a Mac (spec §13a): the platform is forced and the
// same code paths are exercised. Everything here is a pure function.

import { afterEach, describe, expect, it } from "vitest";
import { chordText, matchesChord, parseChord } from "./chords";
import { isMac, primaryModifierLabel, setMacForTests } from "./platform";
import { pathKey, samePath } from "./paths";
import { applyMacChords, command, macOverrides } from "./registry";
import { defaultEol, defaultSettings, parseSettings } from "./settings";

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

describe("path identity follows the platform (review #2)", () => {
  it("treats two cases as two files on macOS", () => {
    setMacForTests(true);
    expect(pathKey("/notes/A.md")).not.toBe(pathKey("/notes/a.md"));
    expect(samePath("/notes/A.md", "/notes/a.md")).toBe(false);
  });

  it("treats them as one file on Windows, either separator", () => {
    setMacForTests(false);
    expect(samePath("C:\\notes\\A.md", "C:/notes/a.md")).toBe(true);
  });

  it("keeps a backslash in a macOS file name instead of folding it", () => {
    setMacForTests(true);
    // `a\b.md` is one legal name there, not a folder and a file.
    expect(pathKey("/notes/a\\b.md")).toBe("/notes/a\\b.md");
    expect(samePath("/notes/a\\b.md", "/notes/a/b.md")).toBe(false);
  });

  it("still drops a trailing slash on both", () => {
    setMacForTests(true);
    expect(pathKey("/notes/")).toBe("/notes");
    expect(pathKey("/")).toBe("/");
    setMacForTests(false);
    expect(pathKey("C:/notes/")).toBe("c:/notes");
  });
});

describe("chords the native menu or the system would steal", () => {
  it("moves replace off ⌘H, which is Hide", () => {
    expect(macOverrides["nav.replace"]).toBe("Ctrl+Alt+F");
    setMacForTests(true);
    expect(chordText("Ctrl+Alt+F")).toBe("⌥⌘F");
  });

  it("drops the focus alias, because replace now owns that chord", () => {
    const list = [
      { id: "view.focus", title: "focus", chord: "F8", chords: ["Ctrl+Alt+F"], run: () => {} },
    ];
    applyMacChords(list);
    expect(list[0]?.chord).toBe("F8");
    expect(list[0]?.chords).toBeUndefined();
  });

  it("uses the literal control key for document switching", () => {
    expect(macOverrides["nav.nextDoc"]).toBe("Control+Tab");
    expect(macOverrides["nav.previousDoc"]).toBe("Control+Shift+Tab");
    setMacForTests(true);
    // ⌃⇥, not ⌘⇥ — the latter is the application switcher.
    expect(parseChord("Control+Tab")).toMatchObject({ ctrl: true, meta: false, code: "Tab" });
  });

  it("gives zoom real keys on macOS, where the webview has none", () => {
    const list = [
      { id: "view.zoomIn", title: "zoom in", hint: "Ctrl+=", run: () => {} },
      { id: "view.zoomOut", title: "zoom out", hint: "Ctrl+-", run: () => {} },
      { id: "view.zoomReset", title: "reset zoom", hint: "Ctrl+0", run: () => {} },
    ];
    applyMacChords(list);
    expect(list.map((c) => (c as { chord?: string }).chord)).toEqual([
      "Ctrl+=",
      "Ctrl+-",
      "Ctrl+0",
    ]);
    // On Windows they stay hints, so `bindings()` leaves them to WebView2.
    expect(command("view.zoomIn")?.chord).toBeUndefined();
    expect(command("view.zoomIn")?.hint).toBe("Ctrl+=");
  });
});

describe("the line ending a new file gets (review #8)", () => {
  it("comes from the platform when there is no settings.json", () => {
    setMacForTests(true);
    expect(defaultSettings().files.newFileEol).toBe("lf");
    // The empty-file and missing-file paths hand out the same thing.
    expect(parseSettings("").settings.files.newFileEol).toBe("lf");
    expect(parseSettings("{").settings.files.newFileEol).toBe("lf");
    setMacForTests(false);
    expect(defaultSettings().files.newFileEol).toBe("crlf");
    expect(parseSettings("").settings.files.newFileEol).toBe("crlf");
  });

  it("keeps an explicit choice, whatever the platform", () => {
    setMacForTests(true);
    expect(parseSettings('{"files":{"newFileEol":"crlf"}}').settings.files.newFileEol).toBe("crlf");
    setMacForTests(false);
    expect(parseSettings('{"files":{"newFileEol":"lf"}}').settings.files.newFileEol).toBe("lf");
  });
});
