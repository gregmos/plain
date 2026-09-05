// The test pack against the serialization side of §1.3: open a file, change
// exactly one line, write it back — and the only bytes that move are that
// line's. Detecting the encoding and the endings is Rust's job (`cargo test`,
// `src-tauri/tests/pack.rs`); this is what the editor hands back.
//
// The encoding fixtures arrive as base64 rather than as files: Vitest runs
// the browser build, which has no `node:fs`, and `?raw` would turn UTF-16
// bytes into whatever they happen to look like in UTF-8.

import { describe, expect, it } from "vitest";
import { encodingLabel, isLegacy, normalizeEol, serialize, type Eol } from "./eol";

interface EncodingEntry {
  rel: string;
  name: string;
  bytes: number;
  encoding: string;
  bom: boolean;
  eol: string;
  dominantEol: string;
  finalNewline: boolean;
  base64: string;
  note?: string;
}

interface PackEntry {
  name?: string;
  rel: string;
  eol: string;
  dominantEol: string;
  finalNewline: boolean;
}

const encodingManifests = import.meta.glob("../../tests/pack/fixtures/encodings.json", {
  import: "default",
  eager: true,
}) as Record<string, { files: EncodingEntry[] }>;

const fixtureManifests = import.meta.glob("../../tests/pack/fixtures/manifest.json", {
  import: "default",
  eager: true,
}) as Record<string, { files: PackEntry[] }>;

const fixtureText = import.meta.glob("../../tests/pack/fixtures/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const encodings = Object.values(encodingManifests)[0]?.files ?? [];
const fixtures = Object.values(fixtureManifests)[0]?.files ?? [];

/* ----------------------------------------------------------------- utils */

function bytesOf(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

/** The text the way Rust hands it to the buffer: BOM gone, endings intact. */
function decodeEntry(entry: EncodingEntry): string {
  return new TextDecoder(entry.encoding).decode(bytesOf(entry.base64));
}

/**
 * Replaces one line and reports which lines actually changed. A diff of one
 * is the whole promise; anything else means bytes moved that nobody touched.
 */
function editedLines(original: string, eol: Eol, target: number, replacement: string): number[] {
  const lines = normalizeEol(original).split("\n");
  lines[target] = replacement;
  const written = serialize(lines.join("\n"), eol);

  const before = original.split(/\r\n|\r|\n/);
  const after = written.split(/\r\n|\r|\n/);
  expect(after).toHaveLength(before.length);
  const moved: number[] = [];
  for (let index = 0; index < before.length; index += 1) {
    if (after[index] !== before[index]) moved.push(index);
  }
  // The final newline is not a line, and it must survive either way.
  expect(written.endsWith("\n")).toBe(original.endsWith("\n"));
  expect(written.endsWith("\r\n")).toBe(original.endsWith("\r\n"));
  return moved;
}

/** The last line with text on it — for a file without a final newline, the
 *  riskiest one to touch. */
function lastRealLine(text: string): number {
  const lines = normalizeEol(text).split("\n");
  return lines.reduce((best, line, index) => (line.trim() === "" ? best : index), -1);
}

/* ------------------------------------------------------------- encodings */

/** `mixed` is the one file shape §8 is allowed to change. */
const uniform = encodings.filter(
  (entry) => entry.eol !== "mixed" && entry.encoding !== "detected" && entry.bytes > 0,
);

describe("pack encodings", () => {
  it("has every variant the pack promises", () => {
    expect(encodings.length).toBeGreaterThanOrEqual(20);
    const labels = new Set(encodings.map((entry) => entry.encoding));
    expect(labels).toContain("utf-8");
    expect(labels).toContain("utf-16le");
    expect(labels).toContain("utf-16be");
    expect(labels).toContain("windows-1251");
    const shapes = new Set(encodings.map((entry) => entry.eol));
    expect(shapes).toEqual(new Set(["lf", "crlf", "cr", "mixed", "none"]));
  });

  it.each(uniform.map((entry) => ({ name: entry.name, entry })))(
    "$name comes back byte for byte",
    ({ entry }) => {
      const text = decodeEntry(entry);
      expect(/[\r\n]$/.test(text)).toBe(entry.finalNewline);
      expect(serialize(normalizeEol(text), entry.dominantEol as Eol)).toBe(text);
    },
  );

  it.each(uniform.filter((entry) => lastRealLine(decodeEntry(entry)) > 0).map((entry) => ({
    name: entry.name,
    entry,
  })))("$name only moves the line that was edited", ({ entry }) => {
    const text = decodeEntry(entry);
    const target = lastRealLine(text);
    expect(editedLines(text, entry.dominantEol as Eol, target, "правленая строка")).toEqual([target]);
  });

  it("normalizes a file with mixed endings to the dominant style, and nothing else", () => {
    const mixed = encodings.filter((entry) => entry.eol === "mixed");
    expect(mixed.length).toBeGreaterThanOrEqual(3);
    for (const entry of mixed) {
      const text = decodeEntry(entry);
      const written = serialize(normalizeEol(text), entry.dominantEol as Eol);
      // Same lines, same order, same text — only the separators moved.
      expect(written.split(/\r\n|\r|\n/)).toEqual(text.split(/\r\n|\r|\n/));
      if (entry.dominantEol === "crlf") expect(written).not.toMatch(/[^\r]\n/);
      if (entry.dominantEol === "lf") expect(written).not.toContain("\r");
      if (entry.dominantEol === "cr") expect(written).not.toContain("\n");
    }
  });

  it("says what the status bar says, and asks before converting legacy", () => {
    for (const entry of encodings) {
      if (entry.encoding === "detected") continue;
      const label = encodingLabel(entry.encoding);
      if (entry.encoding.startsWith("utf-16")) expect(label).toBe("utf-16");
      if (entry.encoding === "windows-1251") expect(label).toBe("cp1251");
      expect(isLegacy(entry.encoding)).toBe(entry.encoding === "windows-1251");
    }
  });

  it("keeps a NUL byte, which is text as far as UTF-8 is concerned", () => {
    const entry = encodings.find((item) => item.name === "nul-byte.md");
    expect(entry, "nul-byte.md is missing from the pack").toBeTruthy();
    const text = decodeEntry(entry as EncodingEntry);
    expect(text).toContain(String.fromCharCode(0));
    expect(serialize(normalizeEol(text), "lf")).toBe(text);
  });

  it("keeps trailing spaces and tabs, which are hard breaks and indentation", () => {
    const entry = encodings.find((item) => item.name === "trailing-spaces.md");
    const text = decodeEntry(entry as EncodingEntry);
    expect(text).toContain("двумя пробелами  \r\n");
    expect(serialize(normalizeEol(text), "crlf")).toBe(text);
  });

  it("adds nothing to a file that ends without a newline", () => {
    for (const name of ["no-final-newline.md", "one-line-no-newline.md"]) {
      const entry = encodings.find((item) => item.name === name);
      const text = decodeEntry(entry as EncodingEntry);
      expect(text.endsWith("\n")).toBe(false);
      expect(serialize(normalizeEol(text), (entry as EncodingEntry).dominantEol as Eol)).toBe(text);
    }
  });

  it("leaves an empty file empty", () => {
    const entry = encodings.find((item) => item.name === "empty.md");
    const text = decodeEntry(entry as EncodingEntry);
    expect(text).toBe("");
    expect(serialize(normalizeEol(text), "crlf")).toBe("");
  });
});

/* -------------------------------------------------------------- fixtures */

describe("pack fixtures survive an edit", () => {
  const cases = fixtures
    .map((entry) => {
      const key = Object.keys(fixtureText).find((path) => path.endsWith(`/${entry.name}`));
      return { name: entry.name ?? entry.rel, entry, key };
    })
    .filter((item) => item.key !== undefined);

  it("has something to work with", () => {
    expect(cases.length).toBeGreaterThanOrEqual(15);
  });

  it.each(cases)("$name round-trips", ({ entry, key }) => {
    const text = fixtureText[key as string] as string;
    expect(serialize(normalizeEol(text), entry.dominantEol as Eol)).toBe(text);
  });

  it.each(cases)("$name only moves the line that was edited", ({ entry, key }) => {
    const text = fixtureText[key as string] as string;
    const target = lastRealLine(text);
    expect(target).toBeGreaterThan(0);
    expect(editedLines(text, entry.dominantEol as Eol, target, "правленая строка")).toEqual([target]);
  });

  it("moves one line wherever in the file it is", () => {
    const first = cases[0];
    expect(first).toBeTruthy();
    const text = fixtureText[first?.key as string] as string;
    const count = normalizeEol(text).split("\n").length;
    for (const target of [1, Math.floor(count / 2), count - 2]) {
      if (target < 1 || target >= count) continue;
      const moved = editedLines(text, "lf", target, `строка ${target}`);
      // A line that already reads exactly that would report no change; every
      // fixture line differs from the replacement, so one is the answer.
      expect(moved, `line ${target} of ${first?.name}`).toEqual([target]);
    }
  });
});
