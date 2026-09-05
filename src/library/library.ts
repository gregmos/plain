// The library screen (mockup 1e, spec §2a). The tree already holds every
// file and its two dates; this only decides the order, the wording of a date
// and where the word counts come from. No index on disk.

import { readFile } from "../app/fs";
import { pathKey } from "../app/paths";
import { countWords } from "../read/words";
import { useStore, type LibrarySort, type TreeNode } from "../app/store";
import { files } from "./tree";

export interface Row {
  path: string;
  name: string;
  rel: string;
  /** The folder the file is in; empty at the root. */
  folder: string;
  mtimeMs: number;
  ctimeMs: number;
}

export function rows(tree: TreeNode[]): Row[] {
  return files(tree).map((node) => {
    const at = node.rel.lastIndexOf("/");
    return {
      path: node.path,
      name: node.name,
      rel: node.rel,
      folder: at < 0 ? "" : node.rel.slice(0, at),
      mtimeMs: node.mtimeMs,
      ctimeMs: node.ctimeMs,
    };
  });
}

/** Newest first for the dates, A→Z for the name (mockup 1e). */
export function sortRows(list: Row[], by: LibrarySort): Row[] {
  const sorted = [...list];
  if (by === "name") {
    sorted.sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
  } else {
    const key = by === "created" ? "ctimeMs" : "mtimeMs";
    sorted.sort((a, b) => b[key] - a[key] || a.rel.localeCompare(b.rel));
  }
  return sorted;
}

/** Only the files that carry the tag; `null` keeps them all (spec §2a). */
export function filterByTag(list: Row[], paths: string[] | null): Row[] {
  if (!paths) return list;
  const wanted = new Set(paths.map(pathKey));
  return list.filter((row) => wanted.has(pathKey(row.path)));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * `4 sep` for this year, `4 sep 2025` for any other — the year is only worth
 * the room when it is a surprise. `now` is passed in so this stays a pure
 * function with a test that does not move.
 */
export function formatDate(ms: number, now = Date.now()): string {
  if (!ms) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const day = `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""}`;
  return date.getFullYear() === new Date(now).getFullYear()
    ? day
    : `${day} ${date.getFullYear()}`;
}

/** `1,204 w`, the way the mockup writes it. */
export function formatWords(words: number): string {
  return `${words.toLocaleString("en-US")} w`;
}

/* ------------------------------------------------------------ word counts */

interface Counted {
  words: number;
  /** The file the count belongs to; a newer one is counted again. */
  mtimeMs: number;
}

const counts = new Map<string, Counted>();
/** One read per file at a time, however many rows scroll past. */
const inFlight = new Set<string>();

export function countedWords(path: string, mtimeMs: number): number | null {
  const known = counts.get(pathKey(path));
  return known && known.mtimeMs === mtimeMs ? known.words : null;
}

/** Everything counted so far, for the `N files · M words` footer. */
export function totalWords(): number {
  let total = 0;
  for (const known of counts.values()) total += known.words;
  return total;
}

export function clearCounts(): void {
  counts.clear();
}

/**
 * Counts one file, once. The screen asks for the rows it can see and calls
 * back when an answer arrives; a file that will not read counts as zero
 * rather than asking again on every scroll.
 */
export async function countFile(path: string, mtimeMs: number): Promise<boolean> {
  const key = pathKey(path);
  if (countedWords(path, mtimeMs) !== null || inFlight.has(key)) return false;
  inFlight.add(key);
  try {
    const info = await readFile(path);
    counts.set(key, { words: countWords(info.text), mtimeMs });
    return true;
  } catch {
    counts.set(key, { words: 0, mtimeMs });
    return true;
  } finally {
    inFlight.delete(key);
  }
}

/** The library screen goes away with its library. */
export function installLibraryCounts(): () => void {
  return useStore.subscribe((state, previous) => {
    if (state.libraryPath !== previous.libraryPath) clearCounts();
  });
}
