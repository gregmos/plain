import { describe, expect, it } from "vitest";
import { tagsOf } from "./tags";
import { render } from "./pipeline";

describe("tagsOf", () => {
  it("finds tags in running text, lowercased, in order, without repeats", () => {
    expect(tagsOf("about #Заметки and #plain, again #заметки\n")).toEqual(["заметки", "plain"]);
  });

  it("needs a word boundary before the hash", () => {
    expect(tagsOf("see (#one) and #two\n")).toEqual(["one", "two"]);
    expect(tagsOf("a url like http://x/y#anchor is not a tag\n")).toEqual([]);
    expect(tagsOf("x#y and a#b\n")).toEqual([]);
  });

  it("ignores code, links and headings", () => {
    expect(tagsOf("`#nope`\n")).toEqual([]);
    expect(tagsOf("```\n#nope\n```\n")).toEqual([]);
    expect(tagsOf("[#nope](./a.md)\n")).toEqual([]);
    expect(tagsOf("# Heading #nope\n")).toEqual([]);
    expect(tagsOf("## Another #nope\n")).toEqual([]);
  });

  it("accepts digits, underscores and dashes inside a tag", () => {
    expect(tagsOf("#read-later #v0_1 #2026\n")).toEqual(["read-later", "v0_1", "2026"]);
  });

  it("stops at punctuation", () => {
    expect(tagsOf("#one, #two. #three!\n")).toEqual(["one", "two", "three"]);
  });
});

describe("tags in the html", () => {
  it("renders a tag as a muted link carrying its name", () => {
    const html = render("about #Заметки here\n").html;
    expect(html).toContain('<a class="tag" data-tag="заметки">#Заметки</a>');
  });

  it("leaves the surrounding text alone", () => {
    const html = render("see (#one) and #two.\n").html;
    expect(html).toContain("see (");
    expect(html).toContain(") and ");
    expect(html).toContain('data-tag="one"');
    expect(html).toContain('data-tag="two"');
    expect(html).toContain(".</p>");
  });

  it("does not touch code or headings", () => {
    expect(render("`#nope`\n").html).toContain("<code>#nope</code>");
    expect(render("# Heading #nope\n").html).not.toContain('class="tag"');
  });
});
