// Where a link in the rendered document points (spec §5.1, §9).
//
// Paths are kept with forward slashes: Windows accepts them everywhere, and
// it keeps joining, comparing and `convertFileSrc` free of separator noise.

import { slug } from "github-slugger";

export type LinkTarget =
  | { kind: "external"; url: string }
  | { kind: "anchor"; id: string }
  | { kind: "file"; path: string; hash: string | null }
  | { kind: "none" };

const EXTERNAL = /^(?:https?|mailto|tel):/i;
const HAS_EXTENSION = /\.[A-Za-z0-9]{1,8}$/;

/** Percent-decoding that survives a stray `%` (spec: `%20`, Cyrillic). */
export function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function isAbsolutePath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || /^[\\/]{2}/.test(path);
}

/** Joins `rel` onto `dir`, resolving `.` and `..`. */
export function joinPath(dir: string, rel: string): string {
  const parts = dir.replace(/\\/g, "/").replace(/\/+$/, "").split("/");
  for (const segment of rel.replace(/\\/g, "/").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (parts.length > 1) parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}

export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Case-insensitive "is this file inside that folder" (Windows). */
export function isInside(path: string, dir: string): boolean {
  const a = normalizePath(path).toLowerCase();
  const b = normalizePath(dir).toLowerCase();
  return a === b || a.startsWith(b + "/");
}

function fromPath(raw: string, dir: string | null): LinkTarget {
  const at = raw.indexOf("#");
  const rawPath = at < 0 ? raw : raw.slice(0, at);
  const hash = at < 0 ? null : decode(raw.slice(at + 1)) || null;
  const path = decode(rawPath);

  if (path === "") return hash ? { kind: "anchor", id: hash } : { kind: "none" };
  if (isAbsolutePath(path)) return { kind: "file", path: normalizePath(path), hash };
  if (!dir) return { kind: "none" };
  return { kind: "file", path: joinPath(dir, path), hash };
}

/** `href` of an ordinary markdown link, seen from the folder of `dir`. */
export function resolveHref(href: string, dir: string | null): LinkTarget {
  const value = href.trim();
  if (value === "") return { kind: "none" };
  if (EXTERNAL.test(value)) return { kind: "external", url: value };
  if (value.startsWith("#")) return { kind: "anchor", id: decode(value.slice(1)) };
  return fromPath(value, dir);
}

/** How many leading path segments two paths share. */
function sharedDepth(a: string, b: string): number {
  const left = a.toLowerCase().split("/");
  const right = b.toLowerCase().split("/");
  let depth = 0;
  while (depth < left.length && depth < right.length && left[depth] === right[depth]) depth += 1;
  return depth;
}

/**
 * A wikilink that names a note rather than a path: `[[тз]]` finds `тз.md`
 * wherever it lives in the library, the way Obsidian resolves one. A target
 * with folders in it (`[[projects/plan]]`) matches on that whole tail.
 * Ties go to the file closest to the document doing the linking.
 */
function byName(index: readonly string[], wanted: string, dir: string | null): string | null {
  const needle = normalizePath(wanted).toLowerCase();
  const tail = `/${needle}`;
  let best: string | null = null;
  let bestDepth = -1;

  for (const candidate of index) {
    const path = normalizePath(candidate);
    const low = path.toLowerCase();
    if (low !== needle && !low.endsWith(tail)) continue;
    const depth = dir ? sharedDepth(path, dir) : 0;
    if (depth > bestDepth) {
      best = path;
      bestDepth = depth;
    }
  }
  return best;
}

/**
 * `[[target#Heading]]` — the target is a file name without an extension most
 * of the time, and the heading turns into the same slug the HTML carries.
 *
 * `index` is the library's file list, when a library is open: a target that
 * is not a real file next to the document is looked up by name across it.
 */
export function resolveWikiLink(
  target: string,
  hash: string | null,
  dir: string | null,
  index?: readonly string[],
): LinkTarget {
  const raw = decode(target.trim());
  if (raw === "") return { kind: "none" };
  const withExtension = HAS_EXTENSION.test(raw) ? raw : `${raw}.md`;
  const anchor = hash ? slug(hash.trim()) : null;

  if (isAbsolutePath(withExtension)) {
    return { kind: "file", path: normalizePath(withExtension), hash: anchor };
  }

  const relative = dir ? joinPath(dir, withExtension) : null;
  if (index && index.length > 0) {
    // The index knows what exists, so it also says when the neighbour is not
    // there and the name has to be looked for somewhere else.
    const here = relative?.toLowerCase();
    const known = here !== undefined && index.some((p) => normalizePath(p).toLowerCase() === here);
    if (!known) {
      const found = byName(index, withExtension, dir);
      if (found) return { kind: "file", path: found, hash: anchor };
    }
  }

  if (!relative) return { kind: "none" };
  return { kind: "file", path: relative, hash: anchor };
}

/** Folder part of a path, with forward slashes. */
export function folderOf(path: string): string {
  const normal = normalizePath(path);
  const at = normal.lastIndexOf("/");
  return at > 0 ? normal.slice(0, at) : normal;
}

/** `notes/a.md` — what the status bar shows while hovering a link. */
export function shortPath(path: string, dir: string | null): string {
  if (dir && isInside(path, dir)) {
    return normalizePath(path).slice(normalizePath(dir).length + 1);
  }
  return normalizePath(path);
}
