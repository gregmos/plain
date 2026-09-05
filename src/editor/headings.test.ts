import { describe, expect, it } from "vitest";
import type { Heading } from "../app/store";
import { headingAbove } from "./headings";

const headings: Heading[] = [
  { level: 1, text: "Title", id: "title", line: 1 },
  { level: 2, text: "One", id: "one", line: 10 },
  { level: 2, text: "Two", id: "two", line: 20 },
  { level: 3, text: "Deep", id: "deep", line: 24 },
];

describe("the heading a line sits under", () => {
  it("takes the last one at or above the line", () => {
    expect(headingAbove(headings, 1)?.id).toBe("title");
    expect(headingAbove(headings, 9)?.id).toBe("title");
    expect(headingAbove(headings, 10)?.id).toBe("one");
    expect(headingAbove(headings, 23)?.id).toBe("two");
    expect(headingAbove(headings, 24)?.id).toBe("deep");
    expect(headingAbove(headings, 999)?.id).toBe("deep");
  });

  it("is nothing above the first heading, or with none at all", () => {
    expect(headingAbove(headings.slice(1), 5)).toBe(null);
    expect(headingAbove([], 5)).toBe(null);
  });
});
