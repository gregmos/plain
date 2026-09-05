// Word count for the status bar and the meta line above H1 (spec §5.1).
//
// Counted from the parsed document, not from a regex over the source (review
// #15): a fence inside a blockquote or a list is a code block just the same,
// and only the tree knows that. Front matter and code blocks are not prose;
// inline code is — it sits in a sentence and reads as a word.

import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import { nodeText, parseDocument } from "./headings";

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;

/** Node types whose whole subtree is not prose. */
const SKIP = new Set([
  "code",
  "yaml",
  "toml",
  "html",
  "math",
  "inlineMath",
  // The uppercase `NOTE` of a callout is ours, not the author's.
  "calloutLabel",
]);

/** The prose of a parsed document, one chunk of text per node. */
export function proseOf(tree: Root): string[] {
  const parts: string[] = [];

  visit(tree, (node) => {
    const type: string = node.type;
    if (SKIP.has(type)) return "skip";
    if (type === "text" || type === "inlineCode") {
      parts.push((node as { value: string }).value);
      return;
    }
    // A wikilink shows its label, and that is what a reader reads.
    if (type === "wikiLink") {
      parts.push(nodeText(node));
      return "skip";
    }
    // A tag is a word on the page, so it is a word in the count.
    if (type === "tag") {
      const children = (node as { data?: { hChildren?: { value?: string }[] } }).data?.hChildren;
      parts.push(children?.[0]?.value ?? "");
      return "skip";
    }
    return;
  });

  return parts;
}

/** Drops front matter and code the way the counter sees the document. */
export function prose(text: string): string {
  return proseOf(parseDocument(text)).join("\n");
}

/** Word-like segments of a piece of prose. */
function segments(body: string): number {
  if (!segmenter) return body.split(/\s+/).filter(Boolean).length;
  let count = 0;
  for (const part of segmenter.segment(body)) if (part.isWordLike) count += 1;
  return count;
}

/** Words in a document that is already parsed — the read pipeline's path. */
export function countWordsOf(tree: Root): number {
  return segments(proseOf(tree).join("\n"));
}

// Segmenting a megabyte of prose is not cheap, and React asks for the same
// number more than once per document (strict mode invokes a memo twice, and
// a re-render may drop the memo entirely). One entry is enough.
let lastText: string | null = null;
let lastCount = 0;

/** Words in a document's source. Shares one parse with the outline. */
export function countWords(text: string): number {
  if (lastText === text) return lastCount;
  const count = countWordsOf(parseDocument(text));
  lastText = text;
  lastCount = count;
  return count;
}

/** Reading time in whole minutes, at the 200 wpm of spec §5.1. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}
