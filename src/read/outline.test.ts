import { describe, expect, it } from "vitest";
import { restoreTarget } from "./outline";

const headings = ["on-plain-text", "three-rules", "lists-inside-lists"];

describe("restoreTarget", () => {
  it("opens at the top when nothing was saved", () => {
    expect(restoreTarget(null, headings)).toBeNull();
  });

  // The bug this exists for: a document nobody scrolled saved its first
  // heading, and reopening scrolled that heading to the top, hiding the meta
  // line and the padding above H1.
  it("opens at the top when the reader was above the first heading", () => {
    expect(restoreTarget("", headings)).toBeNull();
  });

  it("treats the first heading as the top", () => {
    expect(restoreTarget("on-plain-text", headings)).toBeNull();
  });

  it("restores a heading further down", () => {
    expect(restoreTarget("three-rules", headings)).toBe("three-rules");
    expect(restoreTarget("lists-inside-lists", headings)).toBe("lists-inside-lists");
  });

  it("opens at the top when the heading is gone from the document", () => {
    expect(restoreTarget("renamed-since", headings)).toBeNull();
  });

  it("opens at the top when the document has no headings at all", () => {
    expect(restoreTarget("three-rules", [])).toBeNull();
    expect(restoreTarget("", [])).toBeNull();
  });
});
