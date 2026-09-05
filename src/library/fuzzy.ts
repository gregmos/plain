// Quick search ranks files by their path inside the library (spec §4).
// uFuzzy does the matching and the ordering; this only shapes the answer so
// the modal can paint the matched characters with the accent.

import uFuzzy from "@leeoniya/ufuzzy";

export interface Hit {
  /** Index into the haystack that was passed in. */
  index: number;
  /** Flat `[from, to, from, to, …]` ranges over that string. */
  ranges: number[];
}

/** One inserted character per term is enough typo room for file names. */
const engine = new uFuzzy({ intraIns: 1 });

/**
 * Ranked matches, best first. An empty needle matches nothing — the modal
 * shows `recent` instead.
 */
export function rank(haystack: string[], needle: string, limit = 30): Hit[] {
  const query = needle.trim();
  if (query === "" || haystack.length === 0) return [];

  const found = engine.filter(haystack, query);
  if (!found || found.length === 0) return [];

  const info = engine.info(found, haystack, query);
  const order = engine.sort(info, haystack, query);

  const hits: Hit[] = [];
  for (const position of order) {
    const index = info.idx[position];
    if (index === undefined) continue;
    hits.push({ index, ranges: info.ranges[position] ?? [] });
    if (hits.length >= limit) break;
  }
  return hits;
}

export interface Piece {
  text: string;
  hit: boolean;
}

/** Splits a string into plain and matched pieces, ready to render. */
export function pieces(text: string, ranges: number[]): Piece[] {
  const out: Piece[] = [];
  let at = 0;
  for (let i = 0; i + 1 < ranges.length; i += 2) {
    const from = ranges[i] as number;
    const to = ranges[i + 1] as number;
    if (from > at) out.push({ text: text.slice(at, from), hit: false });
    out.push({ text: text.slice(from, to), hit: true });
    at = to;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}
