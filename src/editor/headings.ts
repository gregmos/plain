// Heading slugs for read <-> edit jumps (spec §5.0). Read builds the same
// ids with rehype-slug; both run one slugger over the document top to bottom
// so duplicate headings get the same `-1` suffix on either side.

import GithubSlugger from "github-slugger";

export interface SourceHeading {
  /** 1-based line in the source. */
  line: number;
  text: string;
  id: string;
}

const FENCE = /^\s{0,3}(```|~~~)/;
const ATX = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Drops link and image syntax so the slug matches the rendered heading. */
function plain(text: string): string {
  return text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/!?\[\[([^\]|]*)(?:\|[^\]]*)?\]\]/g, "$1");
}

export function headings(text: string): SourceHeading[] {
  const slugger = new GithubSlugger();
  const found: SourceHeading[] = [];
  let fenced = false;
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const match = ATX.exec(line);
    if (!match) continue;
    const title = plain(match[2] ?? "");
    found.push({ line: i + 1, text: title, id: slugger.slug(title) });
  }
  return found;
}

/** The heading a given line belongs to, for "same heading" scrolling. */
export function headingAt(text: string, line: number): SourceHeading | null {
  let current: SourceHeading | null = null;
  for (const heading of headings(text)) {
    if (heading.line > line) break;
    current = heading;
  }
  return current;
}
