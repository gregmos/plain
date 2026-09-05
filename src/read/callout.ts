// Callouts and GitHub alerts, one implementation (spec §11):
//
//   > [!note]
//   > body
//
//   > [!WARNING] Mind the gap
//   > body
//
// A blockquote whose first line is `[!type]` becomes a callout: uppercase
// label, left rule, no icons. Done on mdast rather than in micromark — the
// construct is a blockquote with a marker line, and rewriting the tree keeps
// nested content (lists, code, other quotes) working for free.

import { visit } from "unist-util-visit";
import type { Blockquote, PhrasingContent, Root, RootContent } from "mdast";

const MARKER = /^\[!([A-Za-z][A-Za-z0-9_-]*)\][+-]?[ \t]*/;

/** Splits a paragraph's children at the first line break. */
function splitAtLineEnd(
  children: PhrasingContent[],
): [PhrasingContent[], PhrasingContent[]] {
  const head: PhrasingContent[] = [];

  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (!child) continue;
    if (child.type === "break") return [head, children.slice(i + 1)];
    if (child.type === "text") {
      const at = child.value.indexOf("\n");
      if (at >= 0) {
        const before = child.value.slice(0, at);
        const after = child.value.slice(at + 1);
        if (before) head.push({ ...child, value: before });
        const tail: PhrasingContent[] = [];
        if (after) tail.push({ ...child, value: after });
        tail.push(...children.slice(i + 1));
        return [head, tail];
      }
    }
    head.push(child);
  }

  return [head, []];
}

function isBlank(children: PhrasingContent[]): boolean {
  return children.every((child) => child.type === "text" && child.value.trim() === "");
}

/**
 * `type` is the generated uppercase label — its own node type, so the word
 * count can tell it apart from the author's own title (review #15).
 */
function span(kind: "type" | "heading", children: PhrasingContent[]): RootContent {
  return {
    type: kind === "type" ? "calloutLabel" : "calloutSpan",
    data: { hName: "span", hProperties: { className: [`callout-${kind}`] } },
    children,
  } as unknown as RootContent;
}

export function remarkCallouts() {
  return (tree: Root): undefined => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const first = node.children[0];
      if (!first || first.type !== "paragraph") return;
      const lead = first.children[0];
      if (!lead || lead.type !== "text") return;

      const match = MARKER.exec(lead.value);
      const kind = match?.[1];
      if (!match || !kind) return;

      lead.value = lead.value.slice(match[0].length);
      const [title, body] = splitAtLineEnd(first.children);

      if (body.length > 0) first.children = body;
      else node.children.shift();

      const label: PhrasingContent[] = [{ type: "text", value: kind.toUpperCase() }];
      const parts: RootContent[] = [span("type", label)];
      if (!isBlank(title)) {
        const trimmed = [...title];
        const start = trimmed[0];
        if (start?.type === "text") trimmed[0] = { ...start, value: start.value.trimStart() };
        parts.push(span("heading", trimmed));
      }

      node.children.unshift({
        type: "calloutTitle",
        data: { hName: "div", hProperties: { className: ["callout-title"] } },
        children: parts,
      } as unknown as Blockquote["children"][number]);

      node.data = {
        ...node.data,
        hName: "div",
        hProperties: { className: ["callout"], dataCallout: kind.toLowerCase() },
      };
    });
    return undefined;
  };
}
