import { describe, expect, it } from "vitest";
import { APP_STYLES, buildExportHtml, escapeHtml } from "./export";
import { render } from "./pipeline";

// Vitest stubs every CSS import, `?raw` included, so the styles are handed in
// here. That the real ones are wired up is checked in the browser.
const STYLES = {
  katex: ".katex { font: normal 1.21em KaTeX_Main; }",
  tokens: [
    "/* comment */",
    ":root {",
    "  --bg: #f7f6f3;",
    "  --accent: #7c3aed;",
    "}",
    "",
    "@media (prefers-color-scheme: dark) {",
    "  :root { --bg: #141413; }",
    "}",
  ].join(String.fromCharCode(10)),
  read: ".read-html blockquote { border-left: 1px solid var(--fg); }",
};

const built = (body: string, title = "формулы", meta: string | null = "5 sep 2026 · 67 words · 1 min") =>
  buildExportHtml({ title, meta, body }, STYLES);

describe("buildExportHtml", () => {
  it("is a whole html document", () => {
    const html = built("<p>hello</p>");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("</html>");
  });

  it("names the file in the title", () => {
    expect(built("<p>x</p>")).toContain("<title>формулы</title>");
  });

  it("escapes a title that looks like markup", () => {
    expect(built("<p>x</p>", 'a <b> & "c"')).toContain(
      "<title>a &lt;b&gt; &amp; &quot;c&quot;</title>",
    );
  });

  it("carries the styles inline, values and all", () => {
    const html = built("<p>x</p>");
    expect(html).toContain("--accent: #7c3aed");
    expect(html).toContain(".read-html blockquote");
    expect(html).toContain(".katex");
    expect(html).toContain('font-family: "IBM Plex Mono"');
    expect(html).not.toContain("<link");
  });

  it("takes only the light half of the tokens", () => {
    const html = built("<p>x</p>");
    expect(html).toContain("--bg: #f7f6f3");
    expect(html).not.toContain("#141413");
    expect(html).not.toContain("prefers-color-scheme");
  });

  it("reaches for the app's own stylesheets by default", () => {
    // Empty under Vitest, non-empty in a real build — the shape is the point.
    expect(APP_STYLES).toHaveProperty("katex");
    expect(APP_STYLES).toHaveProperty("tokens");
    expect(APP_STYLES).toHaveProperty("read");
  });

  it("pins the light theme so read.css's dark rules cannot fire", () => {
    expect(built("<p>x</p>")).toContain('<html data-theme="light">');
  });

  it("keeps the meta line, and drops it when there is none", () => {
    expect(built("<p>x</p>")).toContain('<div class="read-meta">5 sep 2026 · 67 words · 1 min</div>');
    expect(built("<p>x</p>", "n", null)).not.toContain("read-meta");
  });

  it("has no script of any kind", () => {
    const html = built(render("# Title\n\ntext with `code`\n").html);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
  });

  it("puts the document inside the reading column", () => {
    const html = built("<h1>Title</h1>");
    expect(html).toContain('<div class="read-column">');
    expect(html).toContain('<div class="read-html">');
    expect(html).toContain("<h1>Title</h1>");
  });
});

describe("what the export starts from", () => {
  // The live half replaces these; the test pins the shape it relies on.
  it("hands images over as data-src, never as a live src", () => {
    const html = render("![alt](assets/x.png)\n").html;
    expect(html).toContain('data-src="assets/x.png"');
    expect(html).not.toMatch(/<img[^>]*\ssrc=/i);
  });

  it("marks code blocks with their language and mermaid blocks by class", () => {
    expect(render("```ts\nconst a = 1;\n```\n").html).toContain('data-lang="ts"');
    expect(render("```mermaid\ngraph TD\n```\n").html).toContain("mermaid-block");
  });
});

describe("escapeHtml", () => {
  it("covers the four that matter", () => {
    expect(escapeHtml('<&">')).toBe("&lt;&amp;&quot;&gt;");
  });
});
