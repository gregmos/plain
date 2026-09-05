import { describe, expect, it } from "vitest";
import { countWords, prose, readingMinutes } from "./words";

describe("prose", () => {
  it("drops front matter", () => {
    expect(prose("---\ntitle: a b c\n---\nreal text")).toBe("real text");
  });

  it("keeps the text around a horizontal rule", () => {
    expect(countWords("intro\n\n---\n\nmore")).toBe(2);
  });

  it("drops fenced code, backticks and tildes", () => {
    expect(prose("a\n```js\nconst x = 1\n```\nb")).toBe("a\nb");
    expect(prose("a\n~~~\nconst x = 1\n~~~\nb")).toBe("a\nb");
  });

  it("drops indented code", () => {
    expect(prose("a\n\n    const x = 1\n\nb")).toBe("a\nb");
  });

  it("keeps inline code — it is text in a sentence", () => {
    expect(prose("run `npm test` now")).toBe("run \nnpm test\n now");
  });
});

describe("countWords", () => {
  it("counts words, not code", () => {
    expect(countWords("one two three")).toBe(3);
    expect(countWords("one two\n```\nthree four five\n```\n")).toBe(2);
  });

  // review #15: a regex over the source only ever saw top-level fences.
  it("drops a fence inside a blockquote", () => {
    expect(countWords("> ```\n> many code words here\n> ```\n")).toBe(0);
  });

  it("drops a fence inside a list item", () => {
    expect(countWords("- item\n\n  ```\n  many code words here\n  ```\n")).toBe(1);
  });

  it("drops a fence inside a callout", () => {
    expect(countWords("> [!note] Title\n>\n> ```\n> many code words here\n> ```\n")).toBe(1);
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

  it("counts a wikilink by what it shows", () => {
    expect(countWords("see [[some file|the label]]")).toBe(3);
    expect(countWords("see [[some-file]]")).toBe(3);
  });

  it("does not count inline html tags or their attributes", () => {
    expect(countWords('text <b class="x y z">one two</b> here')).toBe(4);
  });
});

describe("readingMinutes", () => {
  it("rounds to whole minutes and never shows zero", () => {
    expect(readingMinutes(612)).toBe(3);
    expect(readingMinutes(10)).toBe(1);
  });
});
