// The promise of §1.3, tested on real files: open, change one line, write —
// and the only bytes that move are that line's. Detecting the encoding and
// the line endings is Rust's job (cargo test); this is the serialization
// side, which is what the editor hands back.

import { describe, expect, it } from "vitest";
import { encodingLabel, isLegacy, normalizeEol, serialize, type Eol } from "./eol";

const files = import.meta.glob("../../tests/corpus/save/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function named(name: string): string {
  const key = Object.keys(files).find((path) => path.endsWith(`/${name}`));
  if (!key) throw new Error(`corpus file missing: ${name}`);
  return files[key] as string;
}

/** What Rust reports for each fixture; kept here on purpose, as a check. */
const CORPUS: { name: string; eol: Eol; finalNewline: boolean }[] = [
  { name: "crlf.md", eol: "crlf", finalNewline: true },
  { name: "lf.md", eol: "lf", finalNewline: true },
  { name: "crlf-no-final.md", eol: "crlf", finalNewline: false },
  { name: "lf-no-final.md", eol: "lf", finalNewline: false },
  { name: "trailing-spaces.md", eol: "crlf", finalNewline: true },
  { name: "tabs.md", eol: "lf", finalNewline: true },
  { name: "cyrillic.md", eol: "crlf", finalNewline: true },
  { name: "frontmatter.md", eol: "lf", finalNewline: false },
];

describe("the corpus survives a round trip", () => {
  it("has every file", () => {
    expect(Object.keys(files)).toHaveLength(CORPUS.length + 1); // + mixed.md
  });

  it.each(CORPUS)("$name comes back byte for byte", ({ name, eol, finalNewline }) => {
    const original = named(name);
    expect(original.endsWith("\n")).toBe(finalNewline);
    expect(serialize(normalizeEol(original), eol)).toBe(original);
  });

  it.each(CORPUS)("$name only moves the line that was edited", ({ name, eol }) => {
    const original = named(name);
    const buffer = normalizeEol(original);
    const lines = buffer.split("\n");
    // The last line with text on it — for the files that end without a
    // newline that is also the riskiest one to touch.
    const target = lines.reduce((best, line, index) => (line.trim() === "" ? best : index), -1);
    expect(target).toBeGreaterThan(0);
    lines[target] = "edited line";
    const written = serialize(lines.join("\n"), eol);

    const before = original.split(/\r\n|\r|\n/);
    const after = written.split(/\r\n|\r|\n/);
    expect(after).toHaveLength(before.length);
    for (let index = 0; index < before.length; index += 1) {
      if (index === target) expect(after[index]).toBe("edited line");
      else expect(after[index]).toBe(before[index]);
    }
    // Trailing spaces and the final newline are part of "byte for byte".
    expect(written.endsWith("\r\n")).toBe(eol === "crlf" && original.endsWith("\r\n"));
    expect(written.endsWith("\n")).toBe(original.endsWith("\n"));
  });

  it("normalizes a file that mixes endings, and only that one", () => {
    const original = named("mixed.md");
    expect(original).toContain("lf line\ncrlf again");
    const written = serialize(normalizeEol(original), "crlf");
    expect(written).toBe(original.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"));
    expect(written).not.toMatch(/[^\r]\n/);
  });
});

describe("serialize", () => {
  it("never adds or removes a final newline", () => {
    expect(serialize("a\nb", "crlf")).toBe("a\r\nb");
    expect(serialize("a\nb\n", "crlf")).toBe("a\r\nb\r\n");
    expect(serialize("a\nb", "lf")).toBe("a\nb");
  });

  it("puts back the old mac style too", () => {
    expect(serialize("a\nb\n", "cr")).toBe("a\rb\r");
  });

  it("is idempotent on text that already has the right endings", () => {
    const crlf = serialize("a\nb\n", "crlf");
    expect(serialize(crlf, "crlf")).toBe(crlf);
  });

  it("leaves a lone \\r inside the text alone only by normalizing it", () => {
    // CodeMirror would have done this already; doing it twice is the point.
    expect(serialize("a\rb", "lf")).toBe("a\nb");
  });
});

describe("encoding names", () => {
  it("says what the status bar says", () => {
    expect(encodingLabel("utf-8")).toBe("utf-8");
    expect(encodingLabel("utf-16le")).toBe("utf-16");
    expect(encodingLabel("utf-16be")).toBe("utf-16");
    expect(encodingLabel("windows-1251")).toBe("cp1251");
    expect(encodingLabel("koi8-r")).toBe("koi8-r");
  });

  it("asks before converting anything that is not unicode (§8)", () => {
    expect(isLegacy("utf-8")).toBe(false);
    expect(isLegacy("utf-16le")).toBe(false);
    expect(isLegacy("utf-16be")).toBe(false);
    expect(isLegacy("windows-1251")).toBe(true);
    expect(isLegacy("windows-1252")).toBe(true);
  });
});
