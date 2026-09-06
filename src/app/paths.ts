// Paths as the two platforms mean them. On Windows separators are normalised
// both ways — dialogs return backslashes, hand-written config may not — and
// case is folded; on macOS neither is safe to do (spec §13a).

import { isWindows } from "./platform";
import type { Doc } from "./store";

export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function dirname(path: string): string {
  const index = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return index > 0 ? path.slice(0, index) : "";
}

/**
 * Identity of a file, used to keep one buffer per file. Feed it the path
 * Rust canonicalized (`read_file` returns one, `canonical_path` makes one):
 * that is what expands an 8.3 name like `KOTENO~1` and settles the case the
 * disk really uses. This only finishes the job — separator and case — so a
 * raw path from a dialog or a link still keys consistently with itself.
 */
export function pathKey(path: string): string {
  // macOS: APFS can be case-sensitive, so `A.md` and `a.md` are two files,
  // and a backslash is a legal character in a name — folding either would
  // hand two documents one buffer, one draft and one Save As (spec §13a).
  if (!isWindows()) {
    const trimmed = path.replace(/\/+$/, "");
    return trimmed === "" ? "/" : trimmed;
  }
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Whether two paths name the same file, by the rules of this platform. */
export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}

function isUnder(path: string, root: string): boolean {
  const a = path.replace(/\\/g, "/").toLowerCase();
  const b = root.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  return a.startsWith(b + "/");
}

/** `folder / file.md` — first crumb is the root and is drawn bolder. */
export function breadcrumbs(libraryPath: string | null, doc: Doc | null): string[] {
  if (!doc) return libraryPath ? [basename(libraryPath)] : [];
  if (!doc.path) return [doc.title];
  if (libraryPath && isUnder(doc.path, libraryPath)) {
    const rel = doc.path.slice(libraryPath.length).replace(/^[\\/]+/, "");
    return [basename(libraryPath), ...rel.split(/[\\/]/).filter(Boolean)];
  }
  const parts = doc.path.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2);
}

/**
 * The same crumbs, split into the three parts the mode bar lays out: the
 * root and the file name keep their width, and everything between them is
 * one cell that gives its width up first when the window is narrow.
 */
export interface Crumbs {
  root: string;
  /** Folders between the root and the file; often empty. */
  middle: string[];
  /** The file; null when only the library is open. */
  leaf: string | null;
}

export function crumbParts(libraryPath: string | null, doc: Doc | null): Crumbs | null {
  const parts = breadcrumbs(libraryPath, doc);
  const root = parts[0];
  if (root === undefined) return null;
  if (parts.length === 1) return { root, middle: [], leaf: null };
  return { root, middle: parts.slice(1, -1), leaf: parts[parts.length - 1] ?? null };
}
