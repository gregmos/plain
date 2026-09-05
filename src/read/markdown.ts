// The Markdown half of read, shared by everything that has to agree about
// what a document says: the full pipeline, `headingsOf` and the word count.
//
// One list, one meaning. If edit and read parsed with different plugin sets
// they would disagree about heading text and ids (review #9, #15).

import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMarkers from "remark-flexible-markers";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { visit, SKIP } from "unist-util-visit";
import type { Plugin, Preset } from "unified";
import type { Root } from "mdast";
import { remarkCallouts } from "./callout";
import { remarkWikiLink } from "./wikilink";

/**
 * Currency, not maths (spec §11): a single-dollar span only counts when there
 * is no space just inside either delimiter and no digit right after the
 * closing one. `$5 и $10` fails both tests and goes back to being text.
 */
export const remarkMathGuard: Plugin<[], Root> = () => (tree, file) => {
  const source = String(file);

  visit(tree, "inlineMath", (node, index, parent) => {
    if (!parent || index === undefined) return;
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return;

    const raw = source.slice(start, end);
    let fence = 0;
    while (raw[fence] === "$") fence += 1;
    if (fence !== 1) return; // `$$…$$` inline is never ambiguous

    const inner = raw.slice(1, -1);
    const after = source.slice(end, end + 1);
    const ok = inner !== "" && !/^\s/.test(inner) && !/\s$/.test(inner) && !/[0-9]/.test(after);
    if (ok) return;

    parent.children[index] = { type: "text", value: raw };
    return SKIP;
  });
};

/** Everything that runs before the tree becomes HTML. */
export const markdownPreset: Preset = {
  plugins: [
    remarkParse,
    [remarkFrontmatter, ["yaml"]],
    remarkGfm,
    [remarkMath, { singleDollarTextMath: true }],
    remarkMathGuard,
    [remarkMarkers, { markerTagName: "mark", markerClassName: () => [] }],
    remarkWikiLink,
    remarkCallouts,
  ],
};
