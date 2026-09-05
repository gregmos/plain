import { describe, expect, it } from "vitest";
import { render } from "./pipeline";

const html = (source: string) => render(source).html;

describe("wikilinks", () => {
  it("renders the three forms", () => {
    const out = html("[[note]] [[note|other name]] [[note#Some Heading]]");
    expect(out).toContain('data-wiki="note"');
    expect(out).toContain("other name");
    expect(out).toContain('data-wiki-hash="Some Heading"');
    expect(out.match(/class="wikilink"/g)).toHaveLength(3);
  });

  it("keeps the alias as the visible text", () => {
    expect(html("[[a/b|see this]]")).toContain(">see this</a>");
  });

  it("leaves brackets inside code alone", () => {
    expect(html("`[[note]]`")).toContain("<code>[[note]]</code>");
    expect(html("```\n[[note]]\n```")).not.toContain("wikilink");
  });

  it("is not a link when empty or blank", () => {
    expect(html("[[]] [[ ]]")).not.toContain("wikilink");
  });

  it("does not cross a line ending", () => {
    expect(html("[[a\nb]]")).not.toContain("wikilink");
  });
});

describe("callouts", () => {
  it("labels the type in uppercase", () => {
    const out = html("> [!note]\n> body text");
    expect(out).toContain('data-callout="note"');
    expect(out).toContain(">NOTE</span>");
    expect(out).toContain("body text");
  });

  it("accepts an uppercase alert and a title", () => {
    const out = html("> [!WARNING] Mind the gap\n> and the rest");
    expect(out).toContain('data-callout="warning"');
    expect(out).toContain(">WARNING</span>");
    expect(out).toContain("Mind the gap");
    expect(out).toContain("and the rest");
  });

  it("keeps nested block content", () => {
    const out = html("> [!tip] Do this\n>\n> - one\n> - two\n>\n> ```js\n> a\n> ```");
    expect(out).toContain("<li>one</li>");
    expect(out).toContain("language-js");
  });

  it("leaves an ordinary quote alone", () => {
    const out = html("> just a quote");
    expect(out).toContain("<blockquote>");
    expect(out).not.toContain("callout");
  });

  it("ignores a marker inside a code block", () => {
    expect(html("```\n> [!note]\n```")).not.toContain("callout");
  });
});

describe("gfm", () => {
  it("renders tables", () => {
    const out = html("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(out).toContain("<table>");
    expect(out).toContain("<th>a</th>");
  });

  it("renders disabled task list checkboxes", () => {
    const out = html("- [ ] todo\n- [x] done");
    expect(out).toContain('type="checkbox"');
    expect(out).toContain("disabled");
    expect(out).toContain("checked");
  });

  it("renders strikethrough", () => {
    expect(html("~~gone~~")).toContain("<del>gone</del>");
  });

  it("renders footnotes", () => {
    const out = html("text[^a]\n\n[^a]: the note");
    expect(out).toContain('id="user-content-fn-a"');
    expect(out).toContain('href="#user-content-fn-a"');
    expect(out).toContain("footnotes-label");
  });
});

describe("math", () => {
  it("renders a real formula", () => {
    expect(html("$x$")).toContain("katex");
    expect(html("$$\nx^2\n$$")).toContain("katex");
  });

  it("leaves currency alone", () => {
    const out = html("Цена $5 и $10 за штуку.");
    expect(out).not.toContain("katex");
    expect(out).toContain("$5 и $10");
  });

  it("leaves a padded span alone", () => {
    expect(html("от $100 — $200")).not.toContain("katex");
  });
});

describe("markers, front matter, sanitizing", () => {
  it("renders ==mark==", () => {
    expect(html("a ==bright== b")).toContain("<mark>bright</mark>");
  });

  it("does not render front matter", () => {
    const out = render("---\ntitle: hello\ndate: 2026-09-04\n---\n\n# body");
    expect(out.html).not.toContain("title:");
    expect(out.frontmatter).toEqual({ title: "hello", date: "2026-09-04" });
  });

  it("only treats a first-line fence as front matter", () => {
    const out = render("intro\n\n---\ntitle: no\n---\n");
    expect(out.frontmatter).toBeNull();
  });

  it("strips script and event handlers", () => {
    const out = html('<script>alert(1)</script><p onclick="alert(1)">hi</p>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    expect(out).not.toContain("onclick");
    expect(out).toContain("hi");
  });

  it("keeps details and summary", () => {
    const out = html("<details><summary>more</summary>\n\nhidden\n\n</details>");
    expect(out).toContain("<details>");
    expect(out).toContain("<summary>more</summary>");
  });

  it("moves image sources out of src", () => {
    const out = html("![alt](https://example.com/a.png)");
    expect(out).not.toContain(" src=");
    expect(out).toContain('data-src="https://example.com/a.png"');
  });

  // review #2: `srcset` is a second way to fetch a picture, and it would walk
  // straight past the deferred `data-src` that keeps read off the network.
  it("drops picture and source entirely", () => {
    const out = html(
      '<picture><source srcset="https://example.com/tracker.png"><img alt="x"></picture>',
    );
    expect(out).not.toContain("srcset");
    expect(out).not.toContain("<source");
    expect(out).not.toContain("<picture");
    expect(out).not.toContain("tracker.png");
  });

  it("drops srcset and sizes from an image", () => {
    const out = html('<img src="a.png" srcset="https://example.com/b.png 2x" sizes="100vw">');
    expect(out).not.toContain("srcset");
    expect(out).not.toContain("sizes");
    expect(out).not.toContain("example.com");
  });
});

describe("headings", () => {
  it("gives the outline the same ids the html carries", () => {
    const out = render("# Первый\n\n## Second one\n\n## Second one\n");
    expect(out.headings.map((h) => h.level)).toEqual([1, 2, 2]);
    expect(out.headings.map((h) => h.text)).toEqual(["Первый", "Second one", "Second one"]);
    for (const heading of out.headings) {
      expect(heading.id).not.toBe("");
      expect(out.html).toContain(`id="${heading.id}"`);
    }
    // Duplicates are disambiguated the way GitHub does it.
    expect(out.headings[1]?.id).not.toBe(out.headings[2]?.id);
  });

  it("reports the source line of each heading", () => {
    const out = render("intro\n\n# one\n\ntext\n\n## two\n");
    expect(out.headings.map((h) => h.line)).toEqual([3, 7]);
  });
});

describe("code frames", () => {
  it("wraps code blocks with a language label and copy", () => {
    const out = html("```ts\nconst a = 1;\n```");
    expect(out).toContain('class="codeblock"');
    expect(out).toContain('data-lang="ts"');
    expect(out).toContain(">ts</span>");
    expect(out).toContain("code-copy");
  });

  it("marks mermaid blocks", () => {
    expect(html("```mermaid\ngraph TD;\n```")).toContain("mermaid-block");
  });

  it("labels a plain fence as text", () => {
    expect(html("```\nplain\n```")).toContain(">text</span>");
  });
});
