import { describe, expect, it } from "vitest";
import { DEFAULTS, parseSettings, serializeSettings, type Settings } from "./settings";
import { useStore } from "./store";

describe("parseSettings", () => {
  it("falls back to defaults on broken JSON and flags it", () => {
    const { settings, invalid } = parseSettings('{"appearance": {"theme": "dark",}');
    expect(invalid).toBe(true);
    expect(settings).toEqual(DEFAULTS);
  });

  it("keeps valid keys and clamps out-of-range ones", () => {
    const { settings, invalid } = parseSettings(
      JSON.stringify({
        appearance: { theme: "dark", fontSize: 99, contentWidth: 700 },
        edit: { lineNumbers: false, indentUnit: "tab", spellcheck: false },
        library: { extensions: [".md", ".txt"] },
      }),
    );
    expect(invalid).toBe(false);
    expect(settings.appearance.theme).toBe("dark");
    expect(settings.appearance.fontSize).toBe(20);
    expect(settings.appearance.contentWidth).toBe(700);
    expect(settings.edit.lineNumbers).toBe(false);
    expect(settings.edit.indentUnit).toBe("tab");
    expect(settings.library.extensions).toEqual([".md", ".txt"]);
    // Untouched sections still come from the defaults.
    // The suite runs pinned to Windows (vitest.setup.ts), so this is crlf.
    expect(settings.files.newFileEol).toBe(DEFAULTS.files.newFileEol);
    expect(DEFAULTS.files.newFileEol).toBe("crlf");
  });

  it("replaces a bad value without discarding the rest of the file", () => {
    const { settings, invalid } = parseSettings(
      JSON.stringify({ appearance: { theme: "neon", contentWidth: 620 } }),
    );
    expect(invalid).toBe(false);
    expect(settings.appearance.theme).toBe("system");
    expect(settings.appearance.contentWidth).toBe(620);
  });
});

const CHANGED: Settings = {
  appearance: { theme: "dark", fontSize: 15, contentWidth: 700 },
  read: { codeWrap: true },
  edit: { lineNumbers: false, indentUnit: "tab", spellcheck: false },
  files: { newFileEol: "lf", autosave: 0 },
  library: { extensions: [".md", ".txt"] },
};

describe("serializeSettings", () => {
  it("writes all eight keys, indented by two", () => {
    const text = serializeSettings(CHANGED);
    expect(text.split("\n")[1]).toBe('  "appearance": {');
    for (const key of [
      "theme",
      "fontSize",
      "contentWidth",
      "codeWrap",
      "lineNumbers",
      "indentUnit",
      "newFileEol",
      "extensions",
      "spellcheck",
    ]) {
      expect(text).toContain(`"${key}"`);
    }
  });

  it("survives a round trip through parseSettings", () => {
    const { settings, invalid } = parseSettings(serializeSettings(CHANGED));
    expect(invalid).toBe(false);
    expect(settings).toEqual(CHANGED);
    expect(parseSettings(serializeSettings(DEFAULTS)).settings).toEqual(DEFAULTS);
  });
});

describe("theme as a setting (spec §10)", () => {
  it("turns a toggle out of \"system\" into the opposite of what is on screen", () => {
    useStore.getState().applySettings(DEFAULTS);
    useStore.setState({ resolvedTheme: "light" });
    useStore.getState().toggleTheme();
    expect(useStore.getState().theme).toBe("dark");
    // The toggle is a settings change, so the file gets it too.
    expect(useStore.getState().settings.appearance.theme).toBe("dark");

    useStore.getState().toggleTheme();
    expect(useStore.getState().theme).toBe("light");
    expect(useStore.getState().settings.appearance.theme).toBe("light");
  });

  it("keeps the rest of the settings when only the theme moves", () => {
    useStore.getState().applySettings(CHANGED);
    useStore.getState().setTheme("system");
    expect(useStore.getState().settings).toEqual({
      ...CHANGED,
      appearance: { ...CHANGED.appearance, theme: "system" },
    });
  });
});
