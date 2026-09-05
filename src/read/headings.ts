// Headings, slugs and source lines from one Markdown parse.
//
// Read and edit must agree on every id, or "jump to the same heading" lands
// somewhere else (review #9). So there is one text extractor and one slugger,
// used both by the read pipeline (which stamps the ids onto the HTML) and by
// `headingsOf`, the cheap parse-only pass the editor calls: remark-parse plus
// the extensions that can change what a heading *says* — no rehype, no
// KaTeX, no HTML.

import GithubSlugger from "github-slugger";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import type { Heading } from "../app/store";
import { markdownPreset } from "./markdown";
import { displayText, type WikiLink } from "./wikilink";

/**
 * Text of an mdast subtree the way read renders it: a wikilink reads as its
 * label, raw HTML tags and images contribute nothing, and a formula counts as
 * its source (the `$` are punctuation the slugger drops either way).
 */
export function nodeText(node: unknown): string {
  const it = node as {
    type?: string;
    value?: unknown;
    children?: unknown;
  };

  if (it.type === "wikiLink") return displayText(node as WikiLink);
  if (it.type === "html" || it.type === "image" || it.type === "imageReference") return "";
  if (Array.isArray(it.children)) return it.children.map(nodeText).join("");
  return typeof it.value === "string" ? it.value : "";
}

/**
 * Walks headings in document order. The slugger comes from outside, because
 * a document has exactly one: headings written as raw HTML are slugged later,
 * against the same instance, or two headings end up sharing an id.
 */
function collect(tree: Root, slugger: GithubSlugger, stampIds: boolean): Heading[] {
  const out: Heading[] = [];

  visit(tree, "heading", (node) => {
    const text = nodeText(node);
    const id = slugger.slug(text);
    if (stampIds) {
      const data = (node.data ??= {});
      data.hProperties = { ...data.hProperties, id };
    }
    out.push({
      level: node.depth,
      text: text.trim(),
      id,
      line: node.position?.start.line ?? 1,
    });
  });

  return out;
}

/**
 * The read pipeline's half: ids go on the nodes here rather than in
 * rehype-slug, so the HTML carries exactly what `headingsOf` reports.
 * Stamping is idempotent — the same text always produces the same ids — so
 * it is safe on the tree `parseDocument` hands round.
 */
export function stampHeadings(tree: Root, slugger: GithubSlugger): Heading[] {
  return collect(tree, slugger, true);
}

// Built once, from the same plugin list the full pipeline uses.
const processor = unified().use(markdownPreset).freeze();

// The outline and the word count ask for the same document one after the
// other, and a re-render asks again; parsing is by far the expensive part, so
// the last tree is kept. Callers must treat it as read-only.
let lastText: string | null = null;
let lastTree: Root | null = null;

/** mdast for a document, with every read extension applied. */
export function parseDocument(text: string): Root {
  if (lastText === text && lastTree) return lastTree;
  // The source has to travel along: the currency guard reads it back.
  const tree = processor.runSync(processor.parse(text) as Root, text) as Root;
  lastText = text;
  lastTree = tree;
  return tree;
}

/** Same headings, slugs and lines as `render()`, without building any HTML. */
export function headingsOf(text: string): Heading[] {
  return collect(parseDocument(text), new GithubSlugger(), false);
}
