// The one markdown pipeline (spec §5.1, §11, §14).
//
//   remark-parse + gfm + math + front matter + wikilinks + callouts + ==mark==
//   -> remark-rehype (dangerous html) -> rehype-raw -> rehype-sanitize
//   -> rehype-slug -> KaTeX -> code frames -> HTML string
//
// Everything here is synchronous: read is built on entering read, once.
// Shiki and Mermaid are async and live in the DOM pass (highlight.ts,
// mermaid.ts), because they cannot run inside `processSync`.

import katex from "katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import GithubSlugger from "github-slugger";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";
import { visit, SKIP } from "unist-util-visit";
import { parse as parseYaml } from "yaml";
import type { Element, ElementContent, Root as HastRoot, Properties } from "hast";
import type { Root as MdastRoot } from "mdast";
import type { Options as SanitizeSchema } from "rehype-sanitize";
import type { Heading } from "../app/store";
import { parseDocument, stampHeadings } from "./headings";
import { countWordsOf } from "./words";

export interface RenderResult {
  html: string;
  headings: Heading[];
  words: number;
  frontmatter: Record<string, unknown> | null;
}

/* ------------------------------------------------------------------ utils */

function classList(node: Element): string[] {
  const value: unknown = node.properties?.["className"];
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? value.split(/\s+/) : [];
}

/** Plain text of a hast subtree; `raw` nodes (KaTeX output) count as text. */
function textOf(node: unknown): string {
  const it = node as { type?: string; value?: unknown; children?: unknown };
  if (it.type === "comment" || it.type === "doctype") return "";
  if (typeof it.value === "string") return it.value;
  return Array.isArray(it.children) ? it.children.map(textOf).join("") : "";
}

function element(
  tagName: string,
  properties: Properties,
  children: ElementContent[],
): Element {
  return { type: "element", tagName, properties, children };
}

/* ----------------------------------------------------------------- schema */

const base = defaultSchema;
const baseAttrs = base.attributes ?? {};

/**
 * GitHub schema plus exactly what our own constructs need. `clobber` is off:
 * ids come from our own markdown (rehype-slug, GFM footnotes), and prefixing
 * them would break every footnote link.
 */
const schema: SanitizeSchema = {
  ...base,
  clobber: [],
  strip: ["script", "style", "iframe", "object", "embed", "form", "textarea", "title"],
  // `picture`/`source` are dropped on purpose: `srcset` is a second way to
  // fetch an image, and it would walk straight past the deferred `data-src`
  // that keeps read off the network (review #2, spec §1.3).
  tagNames: [...(base.tagNames ?? []).filter((tag) => tag !== "picture" && tag !== "source"), "mark"],
  attributes: {
    ...baseAttrs,
    // One entry per property name: hast-util-sanitize stops at the first
    // definition it finds, so the GitHub `className` rule has to be merged
    // rather than appended to.
    a: [
      "ariaDescribedBy",
      "ariaLabel",
      "ariaLabelledBy",
      "dataFootnoteBackref",
      "dataFootnoteRef",
      ["className", "data-footnote-backref", "wikilink"],
      "href",
      "dataWiki",
      "dataWikiHash",
    ],
    code: [["className", /^language-./, "math-inline", "math-display"], "dataLang"],
    div: [
      ...(baseAttrs["div"] ?? []),
      ["className", "callout", "callout-title", "footnotes-label"],
      "dataCallout",
    ],
    span: [["className", "callout-type", "callout-heading"]],
    // `src` never survives the pipeline: rehypeDeferImages moves it out of
    // the way so nothing is fetched before the reader asks for it (spec §1.3).
    img: [
      ...(baseAttrs["img"] ?? []).filter((attr) => attr !== "srcSet" && attr !== "sizes"),
      "dataSrc",
    ],
  },
};

/* ---------------------------------------------------------------- plugins */

function frontmatterOf(tree: MdastRoot): Record<string, unknown> | null {
  const node = tree.children.find((child) => child.type === "yaml");
  if (!node || node.type !== "yaml") return null;
  try {
    const parsed: unknown = parseYaml(node.value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Parks every image source in `data-src`; the DOM pass decides what loads. */
const rehypeDeferImages: Plugin<[], HastRoot> = () => (tree) => {
  visit(tree, "element", (node) => {
    if (node.tagName !== "img" || !node.properties) return;
    const src = node.properties["src"];
    if (typeof src === "string") node.properties["dataSrc"] = src;
    delete node.properties["src"];
  });
};

function renderMath(value: string, display: boolean): ElementContent {
  const html = katex.renderToString(value.trim(), {
    displayMode: display,
    throwOnError: false,
    output: "html",
    strict: false,
  });
  return { type: "raw", value: html } as unknown as ElementContent;
}

/**
 * Runs after sanitize on purpose: KaTeX leans on inline `style` for its
 * spacing, and the GitHub schema strips that attribute.
 */
const rehypeKatex: Plugin<[], HastRoot> = () => (tree) => {
  visit(tree, "element", (node, index, parent) => {
    if (!parent || index === undefined) return;

    if (node.tagName === "pre") {
      const child = node.children.find((c) => c.type === "element");
      if (child?.type !== "element" || !classList(child).includes("math-display")) return;
      parent.children[index] = renderMath(textOf(child), true);
      return SKIP;
    }

    if (node.tagName === "code" && classList(node).includes("math-inline")) {
      parent.children[index] = renderMath(textOf(node), false);
      return SKIP;
    }

    return;
  });
};

/** Wraps every code block in a frame with a language label and `copy`. */
const rehypeCodeFrame: Plugin<[], HastRoot> = () => (tree) => {
  visit(tree, "element", (node, index, parent) => {
    if (!parent || index === undefined || node.tagName !== "pre") return;

    const code = node.children.find((c) => c.type === "element" && c.tagName === "code");
    if (code?.type !== "element") return;

    const lang =
      classList(code)
        .find((name) => name.startsWith("language-"))
        ?.slice("language-".length) ?? "";
    const mermaid = lang === "mermaid";

    if (code.properties) code.properties["dataLang"] = lang;

    const bar = element("div", { className: ["code-bar"] }, [
      element("span", { className: ["code-lang"] }, [{ type: "text", value: lang || "text" }]),
      element("button", { className: ["code-copy"], type: "button" }, [
        { type: "text", value: "copy" },
      ]),
    ]);

    parent.children[index] = element(
      "div",
      {
        className: mermaid ? ["codeblock", "mermaid-block"] : ["codeblock"],
        dataLang: lang,
      },
      [bar, node],
    );
    return SKIP;
  });
};

/* ----------------------------------------------------------------- render */

/**
 * Headings that markdown produced already carry an id (`stampHeadings`); this
 * covers the ones written as raw HTML, using the *same* slugger, so a
 * `<h2>Duplicate</h2>` after a `## Duplicate` gets `duplicate-1` rather than
 * a second `duplicate`.
 */
const rehypeHeadingIds: Plugin<[{ slugger: GithubSlugger | null }], HastRoot> =
  (box) => (tree) => {
    visit(tree, "element", (node) => {
      if (!/^h[1-6]$/.test(node.tagName)) return;
      const properties = (node.properties ??= {});
      if (typeof properties["id"] === "string" && properties["id"] !== "") return;
      properties["id"] = box.slugger?.slug(textOf(node)) ?? "";
    });
  };

// `render` is synchronous and single-threaded, so one box is enough to hand
// the document's slugger to a processor that is built once.
const slugs: { slugger: GithubSlugger | null } = { slugger: null };

/** mdast -> HTML. Built once; `render` runs it over an already parsed tree. */
const html = unified()
  .use(remarkRehype, {
    allowDangerousHtml: true,
    footnoteLabel: "footnotes",
    footnoteLabelTagName: "div",
    footnoteLabelProperties: { className: ["footnotes-label"] },
  })
  .use(rehypeRaw)
  .use(rehypeDeferImages)
  .use(rehypeSanitize, schema)
  .use(rehypeHeadingIds, slugs)
  .use(rehypeKatex)
  .use(rehypeCodeFrame)
  .use(rehypeStringify, { allowDangerousHtml: true })
  .freeze();

// The most expensive thing this app does, and React will ask for it twice:
// strict mode invokes a memo a second time, and a memo is a hint, not a
// promise. The result is immutable to callers, so one entry can be shared.
let lastText: string | null = null;
let lastResult: RenderResult | null = null;

export function render(text: string): RenderResult {
  if (lastText === text && lastResult) return lastResult;
  const result = renderInner(text);
  lastText = text;
  lastResult = result;
  return result;
}

function renderInner(text: string): RenderResult {
  // The Markdown half is `parseDocument`, shared with the outline and the
  // word count: one micromark pass per document, which is by far the most
  // expensive thing here. This side only turns that tree into HTML.
  const tree = parseDocument(text);
  const slugger = new GithubSlugger();
  const headings = stampHeadings(tree, slugger);
  slugs.slugger = slugger;
  const hast = html.runSync(tree as never, text);
  slugs.slugger = null;

  return {
    html: html.stringify(hast),
    headings,
    words: countWordsOf(tree),
    frontmatter: frontmatterOf(tree),
  };
}
