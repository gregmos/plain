// The corpus is the "does it survive real files" check (spec §16). No
// snapshots: they would just record whatever the pipeline does today.

import { describe, expect, it } from "vitest";
import { render } from "./pipeline";

const files = import.meta.glob("../../tests/corpus/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const named = (name: string): string => {
  const key = Object.keys(files).find((path) => path.endsWith(name));
  if (!key) throw new Error(`corpus file missing: ${name}`);
  return files[key] as string;
};

describe("corpus", () => {
  it("has every file", () => {
    expect(Object.keys(files)).toHaveLength(6);
  });

  it.each(Object.keys(files))("renders %s without throwing", (path) => {
    const out = render(files[path] as string);
    expect(out.html.length).toBeGreaterThan(0);
    expect(out.words).toBeGreaterThan(0);
    expect(out.headings.length).toBeGreaterThan(0);
    for (const heading of out.headings) {
      if (heading.text !== "") expect(heading.id).not.toBe("");
    }
  });

  it("renders the basics", () => {
    const out = render(named("01-basics.md"));
    expect(out.html).toContain("<h1");
    expect(out.html).toContain("<blockquote>");
    expect(out.html).toContain("<ol>");
    expect(out.html).toContain("<br>");
    expect(out.html).toContain("<hr>");
    expect(out.headings.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("renders gfm", () => {
    const out = render(named("02-gfm.md"));
    expect(out.html).toContain("<table>");
    expect(out.html).toContain('type="checkbox"');
    expect(out.html).toContain("<del>");
    expect(out.html).toContain("footnotes");
    expect(out.html).toContain('data-callout="note"');
    expect(out.html).toContain('data-callout="warning"');
  });

  it("renders cyrillic, front matter and wikilinks", () => {
    const out = render(named("03-cyrillic.md"));
    expect(out.frontmatter?.["title"]).toBe("Заметка о простом тексте");
    expect(out.html).not.toContain("tags:");
    expect(out.html).toContain('data-wiki="заметка"');
    expect(out.html).toContain("та самая заметка");
    expect(out.html).toContain('data-wiki-hash="Три правила"');
    expect(out.html).toContain("<mark>жёлтым</mark>");
    // Slugs keep Cyrillic, so the outline and the anchors agree.
    expect(out.html).toContain('id="ссылки"');
  });

  it("renders code and math but not currency", () => {
    const out = render(named("04-code-and-math.md"));
    expect(out.html).toContain('data-lang="ts"');
    expect(out.html).toContain("mermaid-block");
    expect(out.html).toContain("katex");
    expect(out.html).toContain("$5 и $10");
    expect(out.html).toContain("Скидка $50, итого $150.");
    expect(out.html).not.toContain('class="wikilink"');
  });

  it("keeps safe html and drops the rest", () => {
    const out = render(named("05-callouts-and-html.md"));
    expect(out.html).toContain("<details>");
    expect(out.html).toContain("<summary>");
    expect(out.html).toContain("<kbd>Ctrl</kbd>");
    expect(out.html).toContain('data-callout="tip"');
    expect(out.html).not.toContain("<script");
    expect(out.html).not.toContain("onclick");
    expect(out.html).not.toContain("<iframe");
    expect(out.html).not.toContain("javascript:");
    // A non-ascii type is not a callout marker.
    expect(out.html).not.toContain('data-callout="заметка"');
  });

  it("handles the odd corners", () => {
    const out = render(named("06-edges.md"));
    const ids = out.headings.map((h) => h.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(out.html).toContain("data-src=");
    expect(out.html).not.toContain(" src=");
    expect(out.html).toContain("*stars*");
  });
});
