// Naming a new file or folder (spec §6): `Untitled.md`, then `Untitled 2.md`.
// Windows compares names without case, so this does too.

/** Splits `Untitled.md` into `Untitled` and `.md`; a folder gets no suffix. */
export function splitName(name: string): { stem: string; suffix: string } {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return { stem: name, suffix: "" };
  return { stem: name.slice(0, dot), suffix: name.slice(dot) };
}

/**
 * The first name in the series that nobody is using. `taken` is whatever the
 * folder already holds — names, not paths.
 */
export function uniqueName(wanted: string, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const name of taken) used.add(name.toLowerCase());
  if (!used.has(wanted.toLowerCase())) return wanted;

  const { stem, suffix } = splitName(wanted);
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem} ${n}${suffix}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${stem} ${Date.now()}${suffix}`;
}

/** A typed name without an extension gets the library's first one. */
export function withExtension(name: string, extension: string): string {
  return /\.[^\\/.]+$/.test(name) ? name : `${name}${extension}`;
}

/** The characters Windows will not accept in a file name. */
const ILLEGAL = new RegExp('[<>:"/\\\\|?*]');

export function nameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "a name is needed";
  if (ILLEGAL.test(trimmed)) return "windows does not allow that character";
  if (/[. ]$/.test(trimmed)) return "a name cannot end with a dot or a space";
  return null;
}
