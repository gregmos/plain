// macOS behaviour without a Mac (spec §13a): the platform is forced and the
// same code paths are exercised. Everything here is a pure function.

import { afterEach, describe, expect, it, vi } from "vitest";
import { chordText, matchesChord, parseChord } from "./chords";
import { isMac, primaryModifierLabel, setMacForTests } from "./platform";
import { defaultEol } from "./settings";

afterEach(() => setMacForTests(null));

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
  // The table is applied when the registry module is evaluated, so the
  // platform has to be forced before it is imported.
  async function registryOn(mac: boolean) {
    vi.resetModules();
    const platform = await import("./platform");
    platform.setMacForTests(mac);
    return import("./registry");
  }

  afterEach(() => vi.resetModules());

  it("moves history off the arrow keys macOS uses for words", async () => {
    const { command } = await registryOn(true);
    expect(command("nav.back")?.chord).toBe("Ctrl+Alt+Left");
    expect(command("nav.forward")?.chord).toBe("Ctrl+Alt+Right");
  });

  it("gives fullscreen the system chord, with the real control key", async () => {
    const { command } = await registryOn(true);
    expect(command("view.fullscreen")?.chord).toBe("Control+Cmd+F");
  });

  it("leaves every other chord exactly as Windows has it", async () => {
    const mac = await registryOn(true);
    const saveOnMac = mac.command("file.save")?.chord;
    const win = await registryOn(false);
    expect(saveOnMac).toBe(win.command("file.save")?.chord);
    expect(win.command("nav.back")?.chord).toBe("Alt+Left");
    expect(win.command("view.fullscreen")?.chord).toBe("F11");
  });
});
