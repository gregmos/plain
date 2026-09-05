import { describe, expect, it } from "vitest";
import { pieces, rank } from "./fuzzy";

const paths = [
  "notes/ideas.md",
  "notes/on-plain-text.md",
  "projects/plain/README.md",
  "projects/plain/CHANGELOG.md",
];

/** The relative paths a set of hits points at, in the order they ranked. */
function ranked(needle: string): string[] {
  return rank(paths, needle).map((hit) => paths[hit.index] as string);
}

describe("rank", () => {
  it("keeps only the paths that contain the query", () => {
    const found = ranked("plain");
    expect(found).toHaveLength(3);
    expect(found).not.toContain("notes/ideas.md");
  });

  it("matches a name across the folders in front of it", () => {
    expect(ranked("readme")).toEqual(["projects/plain/README.md"]);
  });

  it("has nothing to say about an empty query", () => {
    expect(rank(paths, "")).toEqual([]);
    expect(rank(paths, "   ")).toEqual([]);
  });

  it("returns nothing rather than everything when there is no match", () => {
    expect(rank(paths, "zzzz")).toEqual([]);
  });

  it("reports where the match is, so it can be painted", () => {
    const hit = rank(["notes/on-plain-text.md"], "plain")[0];
    expect(hit).toBeDefined();
    const text = "notes/on-plain-text.md";
    const shown = pieces(text, hit?.ranges ?? [])
      .filter((piece) => piece.hit)
      .map((piece) => piece.text)
      .join("");
    expect(shown.toLowerCase()).toBe("plain");
  });
});

// uFuzzy's defaults are spelled `[A-Za-z]`, so without the unicode options
// a Cyrillic library found nothing at all.
const cyrillic = [
  "проекты/plain/тз.md",
  "recipes/борщ.md",
  "дневник/2026-01.md",
  "дневник/2026-02.md",
  "заметки/дневник чтения.md",
  "notes/overview.md",
];

function found(needle: string): string[] {
  return rank(cyrillic, needle).map((hit) => cyrillic[hit.index] as string);
}

describe("rank, in Cyrillic", () => {
  it("finds a file whose whole name is Cyrillic", () => {
    expect(found("тз")).toEqual(["проекты/plain/тз.md"]);
  });

  it("finds one inside a latin path", () => {
    expect(found("борщ")).toEqual(["recipes/борщ.md"]);
  });

  it("finds every file the word appears in", () => {
    expect(found("дневник")).toEqual([
      "дневник/2026-01.md",
      "дневник/2026-02.md",
      "заметки/дневник чтения.md",
    ]);
  });

  it("matches a folder and a name across the separator", () => {
    expect(found("заметки чтения")).toEqual(["заметки/дневник чтения.md"]);
  });

  it("still says nothing when the word is not there", () => {
    expect(found("щщщ")).toEqual([]);
  });

  it("leaves latin matching as it was", () => {
    expect(found("overview")).toEqual(["notes/overview.md"]);
    expect(found("plain")).toEqual(["проекты/plain/тз.md"]);
  });

  it("paints the Cyrillic characters it matched", () => {
    const hit = rank(["дневник/2026-01.md"], "дневник")[0];
    const shown = pieces("дневник/2026-01.md", hit?.ranges ?? [])
      .filter((piece) => piece.hit)
      .map((piece) => piece.text)
      .join("");
    expect(shown).toBe("дневник");
  });
});

describe("pieces", () => {
  it("puts the string back together, matched parts marked", () => {
    const parts = pieces("abcdef", [2, 4]);
    expect(parts.map((p) => p.text).join("")).toBe("abcdef");
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["cd"]);
  });

  it("survives a string with no match at all", () => {
    expect(pieces("abc", [])).toEqual([{ text: "abc", hit: false }]);
  });
});
