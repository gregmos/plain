// Tags (spec §2a): `#заметки` in running text, nothing else.
//
// Not in code, not in a link, not in a heading, and not the `#` of a URL
// fragment — a tag starts a word, so it is preceded by the start of the
// text, whitespace or an opening bracket.

import { visit, SKIP } from "unist-util-visit";
import type { Parent, Root, RootContent, Text } from "mdast";
import { parseDocument } from "./headings";

/**
 * `#tag` at a word boundary; the boundary character is captured too. The tag
 * needs a letter somewhere: `#12` in "issue #12" is a number, not a tag (the
 * same rule Obsidian applies; the Rust side in `search.rs` agrees).
 */
const TAG = /(^|[\s(])#(?=[\d_-]*\p{L})([\p{L}\d_][\p{L}\d_-]*)/gu;

/** Subtrees a tag cannot live in. */
const CLOSED = new Set(["code", "inlineCode", "link", "linkReference", "definition", "heading"]);

function tagNode(raw: string): RootContent {
  return {
    type: "tag",
    data: {
      hName: "a",
      hProperties: { className: ["tag"], dataTag: raw.toLowerCase() },
      hChildren: [{ type: "text", value: `#${raw}` }],
    },
  } as unknown as RootContent;
}

/** Splits one text node into text and tag nodes; null when it holds no tag. */
function split(value: string): RootContent[] | null {
  TAG.lastIndex = 0;
  let match = TAG.exec(value);
  if (!match) return null;

  const out: RootContent[] = [];
  let at = 0;
  while (match) {
    const boundary = match[1] ?? "";
    const raw = match[2] as string;
    const before = value.slice(at, match.index) + boundary;
    if (before !== "") out.push({ type: "text", value: before } as Text);
    out.push(tagNode(raw));
    at = match.index + match[0].length;
    match = TAG.exec(value);
  }
  if (at < value.length) out.push({ type: "text", value: value.slice(at) } as Text);
  return out;
}

/** unified plugin: turns `#tag` into a link the reader can click. */
export function remarkTags() {
  return (tree: Root): undefined => {
    visit(tree, (node, index, parent) => {
      if (CLOSED.has(node.type)) return SKIP;
      if (node.type !== "text" || !parent || index === undefined) return;
      const parts = split((node as Text).value);
      if (!parts) return;
      (parent as Parent).children.splice(index, 1, ...(parts as Parent["children"]));
      return [SKIP, index + parts.length];
    });
    return undefined;
  };
}

/**
 * Every tag in a document, lowercased, without repeats, in the order they
 * appear. Shares the parse with the outline and the word count.
 */
export function tagsOf(text: string): string[] {
  return tagsIn(parseDocument(text));
}

/** The same, for a tree that is already parsed. */
export function tagsIn(tree: Root): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  visit(tree, (node) => {
    const type: string = node.type;
    if (CLOSED.has(type)) return SKIP;
    // A document that has been through `remarkTags` carries them as nodes.
    if (type === "tag") {
      const tag = (node as { data?: { hProperties?: { dataTag?: string } } }).data?.hProperties
        ?.dataTag;
      if (tag && !seen.has(tag)) {
        seen.add(tag);
        out.push(tag);
      }
      return SKIP;
    }
    if (type !== "text") return;
    TAG.lastIndex = 0;
    let match = TAG.exec((node as Text).value);
    while (match) {
      const tag = (match[2] as string).toLowerCase();
      if (!seen.has(tag)) {
        seen.add(tag);
        out.push(tag);
      }
      match = TAG.exec((node as Text).value);
    }
    return;
  });

  return out;
}
