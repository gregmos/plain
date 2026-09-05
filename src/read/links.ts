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

/**
 * `[[target#Heading]]` — the target is a file name without an extension most
 * of the time, and the heading turns into the same slug rehype-slug produced.
 */
export function resolveWikiLink(
  target: string,
  hash: string | null,
  dir: string | null,
): LinkTarget {
  const raw = decode(target.trim());
  if (raw === "") return { kind: "none" };
  const withExtension = HAS_EXTENSION.test(raw) ? raw : `${raw}.md`;
  const anchor = hash ? slug(hash.trim()) : null;

  if (isAbsolutePath(withExtension)) {
    return { kind: "file", path: normalizePath(withExtension), hash: anchor };
  }
  if (!dir) return { kind: "none" };
  return { kind: "file", path: joinPath(dir, withExtension), hash: anchor };
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
