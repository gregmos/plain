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
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkRehype from "remark-rehype";
import { unified, type Plugin } from "unified";
import { visit, SKIP } from "unist-util-visit";
import { parse as parseYaml } from "yaml";
import type { Element, ElementContent, Root as HastRoot, Properties } from "hast";
import type { Root as MdastRoot } from "mdast";
import type { Options as SanitizeSchema } from "rehype-sanitize";
import type { Heading } from "../app/store";
import { remarkHeadings } from "./headings";
import { markdownPreset } from "./markdown";
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

/** Counts on the tree the pipeline already built — one parse, not two. */
const remarkWords: Plugin<[{ value: number }], MdastRoot> = (box) => (tree) => {
  box.value = countWordsOf(tree);
};

interface FrontmatterBox {
  value: Record<string, unknown> | null;
}

const remarkFrontmatterValue: Plugin<[FrontmatterBox], MdastRoot> = (box) => (tree) => {
  const node = tree.children.find((child) => child.type === "yaml");
  if (!node || node.type !== "yaml") return;
  try {
    const parsed: unknown = parseYaml(node.value);
    box.value =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
  } catch {
    box.value = null;
  }
};

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

export function render(text: string): RenderResult {
  const headings: Heading[] = [];
  const frontmatter: FrontmatterBox = { value: null };
  const words = { value: 0 };

  const file = unified()
    .use(markdownPreset)
    .use(remarkHeadings, headings)
    .use(remarkWords, words)
    .use(remarkFrontmatterValue, frontmatter)
    .use(remarkRehype, {
      allowDangerousHtml: true,
      footnoteLabel: "footnotes",
      footnoteLabelTagName: "div",
      footnoteLabelProperties: { className: ["footnotes-label"] },
    })
    .use(rehypeRaw)
    .use(rehypeDeferImages)
    .use(rehypeSanitize, schema)
    // Markdown headings already carry their id; this only covers headings
    // written as raw HTML, which the outline does not know about anyway.
    .use(rehypeSlug)
    .use(rehypeKatex)
    .use(rehypeCodeFrame)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .processSync(text);

  return {
    html: String(file),
    headings,
    words: words.value,
    frontmatter: frontmatter.value,
  };
}
