// Line endings live in exactly two places: normalized to `\n` inside the app
// (CodeMirror insists on it), and in the file's own style on disk (spec §8).

export type Eol = "crlf" | "lf" | "cr";

/** CodeMirror normalizes line endings; everything compared to it must too. */
export function normalizeEol(text: string): string {
  return text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
}

/**
 * The buffer's `\n` text back in the file's own style. Nothing else happens
 * here — no trailing newline is added or removed, because bytes the user did
 * not touch do not change (spec §1.3).
 */
export function serialize(text: string, eol: Eol): string {
  const lf = normalizeEol(text);
  if (eol === "crlf") return lf.replace(/\n/g, "\r\n");
  if (eol === "cr") return lf.replace(/\n/g, "\r");
  return lf;
}

/** `utf-8` · `utf-16` · `cp1251` — what the status bar shows (spec §4). */
export function encodingLabel(encoding: string): string {
  if (encoding.startsWith("utf-16")) return "utf-16";
  const legacy = /^windows-(\d+)$/.exec(encoding);
  return legacy ? `cp${legacy[1]}` : encoding;
}

/** UTF-8 and UTF-16 are written back as they were; everything else asks. */
export function isLegacy(encoding: string): boolean {
  return encoding !== "utf-8" && !encoding.startsWith("utf-16");
}
