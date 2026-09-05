import { describe, expect, it } from "vitest";
import { headingsOf } from "./headings";
import { render } from "./pipeline";

/** Review #9: edit and read must not disagree about a single id. */
function agree(source: string) {
  const read = render(source);
  const cheap = headingsOf(source);
  expect(cheap).toEqual(read.headings);
  for (const heading of read.headings) {
    if (heading.text !== "") expect(read.html).toContain(`id="${heading.id}"`);
  }
  return cheap;
}

describe("headingsOf", () => {
  it("matches read on ordinary headings", () => {
    const out = agree("# One\n\ntext\n\n## Two words\n\n### Три слова\n");
    expect(out).toEqual([
      { level: 1, text: "One", id: "one", line: 1 },
      { level: 2, text: "Two words", id: "two-words", line: 5 },
      { level: 3, text: "Три слова", id: "три-слова", line: 7 },
    ]);
  });

  it("matches read on setext headings", () => {
    const out = agree("Title here\n==========\n\nbody\n\nSecond\n------\n");
    expect(out).toEqual([
      { level: 1, text: "Title here", id: "title-here", line: 1 },
      { level: 2, text: "Second", id: "second", line: 6 },
    ]);
  });

  it("matches read on a wikilink heading, alias and all", () => {
    const out = agree("# [[file|Alias]]\n\n## [[other]]\n\n### [[note#Deep]]\n");
    expect(out[0]).toEqual({ level: 1, text: "Alias", id: "alias", line: 1 });
    expect(out[1]?.text).toBe("other");
    expect(out[2]?.text).toBe("note › Deep");
  });

  it("matches read on inline markup, code and math", () => {
    agree("# **bold** and `code`\n\n## $x$ and ~~gone~~\n\n### Цена $5 и $10\n");
  });

  it("matches read on duplicates and empty headings", () => {
    const out = agree("## Same\n\n## Same\n\n##\n\n## Same\n");
    expect(out.map((h) => h.id)).toEqual(["same", "same-1", "", "same-2"]);
  });

  it("matches read on headings inside quotes and lists", () => {
    agree("> # Quoted\n\n- item\n\n  ## In a list\n");
  });

  it("does not see a heading in fenced code or front matter", () => {
    const out = agree("---\ntitle: # not a heading\n---\n\n# Real\n\n```\n# also not\n```\n");
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe("Real");
  });

  it("reports the source line of every heading", () => {
    const out = headingsOf("intro\n\n# one\n\ntext\n\n## two\n");
    expect(out.map((h) => h.line)).toEqual([3, 7]);
  });
});
