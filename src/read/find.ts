// Text search over the rendered document (spec §5.1). No mapping back into
// the source: this searches what is on screen, and paints with the CSS
// Custom Highlight API so the DOM is never touched.

import { hasHighlights } from "../app/platform";

interface Chunk {
  node: Text;
  start: number;
}

interface Index {
  text: string;
  chunks: Chunk[];
}

/** All visible text of `root`, plus where each text node starts in it. */
export function indexText(root: HTMLElement): Index {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("[hidden], .code-bar, .h-anchor")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const chunks: Chunk[] = [];
  let text = "";
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue ?? "";
    if (value !== "") {
      chunks.push({ node: node as Text, start: text.length });
      text += value;
    }
    node = walker.nextNode();
  }
  return { text, chunks };
}

function locate(chunks: Chunk[], offset: number): { node: Text; offset: number } | null {
  let low = 0;
  let high = chunks.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const chunk = chunks[mid];
    if (!chunk) break;
    const end = chunk.start + (chunk.node.nodeValue?.length ?? 0);
    if (offset < chunk.start) high = mid - 1;
    else if (offset >= end) low = mid + 1;
    else return { node: chunk.node, offset: offset - chunk.start };
  }
  const last = chunks[chunks.length - 1];
  if (last && offset === last.start + (last.node.nodeValue?.length ?? 0)) {
    return { node: last.node, offset: last.node.nodeValue?.length ?? 0 };
  }
  return null;
}

/** Ranges for every occurrence of `query`, in document order. */
export function findRanges(
  root: HTMLElement,
  query: string,
  caseSensitive: boolean,
): Range[] {
  if (query === "") return [];
  const { text, chunks } = indexText(root);
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();

  const ranges: Range[] = [];
  let at = haystack.indexOf(needle);
  while (at >= 0 && ranges.length < 2000) {
    const from = locate(chunks, at);
    const to = locate(chunks, at + needle.length);
    if (from && to) {
      const range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      ranges.push(range);
    }
    at = haystack.indexOf(needle, at + Math.max(1, needle.length));
  }
  return ranges;
}

/* ------------------------------------------------- CSS Custom Highlight API */

interface HighlightRegistryLike {
  set(name: string, value: object): void;
  delete(name: string): void;
}

// Safari has the Custom Highlight API only from 17.2; without it find still
// finds and scrolls, it just does not paint (spec §13a).
const registry = hasHighlights()
  ? (CSS as unknown as { highlights?: HighlightRegistryLike }).highlights
  : undefined;
const HighlightCtor = hasHighlights()
  ? (globalThis as unknown as { Highlight?: new (...ranges: Range[]) => object }).Highlight
  : undefined;

export const ALL = "plain-find";
export const CURRENT = "plain-find-active";

export function paint(all: Range[], current: Range | null): void {
  if (!registry || !HighlightCtor) return;
  if (all.length === 0) registry.delete(ALL);
  else registry.set(ALL, new HighlightCtor(...all));
  if (current) registry.set(CURRENT, new HighlightCtor(current));
  else registry.delete(CURRENT);
}

export function clearPaint(): void {
  registry?.delete(ALL);
  registry?.delete(CURRENT);
}

/** Scrolls `range` into the middle of `container` when it is out of sight. */
export function scrollRangeIntoView(container: HTMLElement, range: Range): void {
  const box = range.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return;
  const frame = container.getBoundingClientRect();
  if (box.top >= frame.top + 8 && box.bottom <= frame.bottom - 8) return;
  container.scrollTop += box.top - frame.top - frame.height / 3;
}
