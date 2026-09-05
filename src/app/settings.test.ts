import { describe, expect, it } from "vitest";
import { DEFAULTS, parseSettings } from "./settings";

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
        edit: { lineNumbers: false, indentUnit: "tab" },
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
    expect(settings.files.newFileEol).toBe(DEFAULTS.files.newFileEol);
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
