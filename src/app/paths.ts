// Windows paths, but separators are normalised both ways: dialogs return
// backslashes, hand-written config may not.

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
  return path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
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
