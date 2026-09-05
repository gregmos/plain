import { describe, expect, it } from "vitest";
import { headingAt, headings } from "./headings";

const source = [
  "---",
  "date: 2026-09-04",
  "---",
  "",
  "# On plain text",
  "",
  "text",
  "",
  "```",
  "# not a heading",
  "```",
  "",
  "## Three rules",
  "",
  "more text",
  "",
  "## Three rules",
].join("\n");

describe("headings", () => {
  it("finds them with github slugs and lines", () => {
    expect(headings(source)).toEqual([
      { line: 5, text: "On plain text", id: "on-plain-text" },
      { line: 13, text: "Three rules", id: "three-rules" },
      { line: 17, text: "Three rules", id: "three-rules-1" },
    ]);
  });

  it("uses the link text, like the rendered heading does", () => {
    expect(headings("# See [the docs](x.md)")[0]?.id).toBe("see-the-docs");
  });

  it("answers which heading a line sits under", () => {
    expect(headingAt(source, 16)?.id).toBe("three-rules");
    expect(headingAt(source, 2)).toBe(null);
  });
});
