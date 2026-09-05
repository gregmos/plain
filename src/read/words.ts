// Word count for the status bar and the meta line above H1 (spec §5.1).
// Front matter and fenced code are not prose, so they never reach the
// segmenter. Everything else — including inline code and link text — counts.

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Drops YAML front matter and fenced code blocks; keeps the rest verbatim. */
export function prose(text: string): string {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let i = 0;

  // Front matter only exists when `---` is the very first line (spec §11).
  if (lines[0]?.trim() === "---") {
    let end = 1;
    while (end < lines.length && !/^(-{3,}|\.{3})\s*$/.test(lines[end] ?? "")) end += 1;
    if (end < lines.length) i = end + 1;
  }

  const out: string[] = [];
  let fence: string | null = null;

  for (; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = FENCE.exec(line);
    if (fence === null) {
      if (match?.[1]) {
        fence = match[1];
        continue;
      }
      out.push(line);
      continue;
    }
    // A closing fence is the same character, at least as long, nothing after.
    const marker = match?.[1];
    if (
      marker &&
      marker[0] === fence[0] &&
      marker.length >= fence.length &&
      line.slice(match[0].length).trim() === ""
    ) {
      fence = null;
    }
  }

  return out.join("\n");
}

/** Word-like segments of the prose part of a markdown document. */
export function countWords(text: string): number {
  const body = prose(text);
  if (!segmenter) return body.split(/\s+/).filter(Boolean).length;
  let count = 0;
  for (const part of segmenter.segment(body)) if (part.isWordLike) count += 1;
  return count;
}

/** Reading time in whole minutes, at the 200 wpm of spec §5.1. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}
