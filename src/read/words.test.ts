import { describe, expect, it } from "vitest";
import { countWords, prose, readingMinutes } from "./words";

describe("prose", () => {
  it("drops front matter", () => {
    expect(prose("---\ntitle: a b c\n---\nreal text")).toBe("real text");
  });

  it("keeps a horizontal rule that is not front matter", () => {
    expect(prose("intro\n\n---\n\nmore")).toContain("---");
  });

  it("drops fenced code, backticks and tildes", () => {
    expect(prose("a\n```js\nconst x = 1\n```\nb")).toBe("a\nb");
    expect(prose("a\n~~~\nconst x = 1\n~~~\nb")).toBe("a\nb");
  });

  it("does not close a backtick fence with a tilde one", () => {
    expect(prose("a\n```\nx\n~~~\ny\n```\nb")).toBe("a\nb");
  });

  it("keeps a longer inner fence inside a longer outer one", () => {
    expect(prose("a\n````\n```\nx\n```\n````\nb")).toBe("a\nb");
  });
});

describe("countWords", () => {
  it("counts words, not code", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("one two\n```\nthree four five\n```\n")).toBe(2);
  });

  it("counts Cyrillic", () => {
    expect(countWords("одно два три")).toBe(3);
  });

  it("ignores punctuation", () => {
    expect(countWords("hi, there — you!")).toBe(3);
  });

  it("skips front matter", () => {
    expect(countWords("---\ntitle: a b c d\n---\none two")).toBe(2);
  });
});

describe("readingMinutes", () => {
  it("rounds to whole minutes and never shows zero", () => {
    expect(readingMinutes(612)).toBe(3);
    expect(readingMinutes(10)).toBe(1);
  });
});
