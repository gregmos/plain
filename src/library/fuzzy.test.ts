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
