// %APPDATA%\Plain\settings.json — read once at startup (spec §10).
// Broken JSON falls back to defaults and raises a banner; a single bad value
// falls back to that key's default and the rest of the file still applies.

import { BaseDirectory, exists, readTextFile } from "@tauri-apps/plugin-fs";
import { inTauri } from "./env";

export type Theme = "system" | "light" | "dark";
export type IndentUnit = "tab" | 2 | 4;
export type Eol = "crlf" | "lf";

export interface Settings {
  appearance: { theme: Theme; fontSize: number; contentWidth: number };
  read: { codeWrap: boolean };
  edit: { lineNumbers: boolean; indentUnit: IndentUnit };
  files: { newFileEol: Eol };
  library: { extensions: string[] };
}

export const SETTINGS_FILE = "settings.json";

export const DEFAULTS: Settings = {
  appearance: { theme: "system", fontSize: 13.5, contentWidth: 560 },
  read: { codeWrap: false },
  edit: { lineNumbers: true, indentUnit: 2 },
  files: { newFileEol: "crlf" },
  library: { extensions: [".md", ".markdown"] },
};

type Json = Record<string, unknown>;

function section(raw: unknown, key: string): Json {
  const root = raw as Json | null;
  const value = root && typeof root === "object" ? root[key] : undefined;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Shapes an already-parsed value into Settings, clamping what is out of range. */
export function normalizeSettings(raw: unknown): Settings {
  const appearance = section(raw, "appearance");
  const read = section(raw, "read");
  const edit = section(raw, "edit");
  const files = section(raw, "files");
  const library = section(raw, "library");

  const extensions = library["extensions"];
  const validExtensions =
    Array.isArray(extensions) && extensions.every((e) => typeof e === "string" && e.length > 0)
      ? (extensions as string[])
      : DEFAULTS.library.extensions;

  return {
    appearance: {
      theme: oneOf(appearance["theme"], ["system", "light", "dark"] as const, DEFAULTS.appearance.theme),
      fontSize: num(appearance["fontSize"], 11, 20, DEFAULTS.appearance.fontSize),
      contentWidth: num(appearance["contentWidth"], 440, 900, DEFAULTS.appearance.contentWidth),
    },
    read: { codeWrap: bool(read["codeWrap"], DEFAULTS.read.codeWrap) },
    edit: {
      lineNumbers: bool(edit["lineNumbers"], DEFAULTS.edit.lineNumbers),
      indentUnit: oneOf(edit["indentUnit"], ["tab", 2, 4] as const, DEFAULTS.edit.indentUnit),
    },
    files: { newFileEol: oneOf(files["newFileEol"], ["crlf", "lf"] as const, DEFAULTS.files.newFileEol) },
    library: { extensions: validExtensions },
  };
}

export interface ParsedSettings {
  settings: Settings;
  invalid: boolean;
}

/** Parses the file text. Unparseable JSON -> defaults + invalid flag. */
export function parseSettings(text: string): ParsedSettings {
  if (text.trim() === "") return { settings: DEFAULTS, invalid: false };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { settings: DEFAULTS, invalid: true };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { settings: DEFAULTS, invalid: true };
  }
  return { settings: normalizeSettings(raw), invalid: false };
}

/** Reads settings.json from the app data dir. Missing file is not an error. */
export async function loadSettings(): Promise<ParsedSettings> {
  if (!inTauri) return { settings: DEFAULTS, invalid: false };
  try {
    const there = await exists(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
    if (!there) return { settings: DEFAULTS, invalid: false };
    const text = await readTextFile(SETTINGS_FILE, { baseDir: BaseDirectory.AppData });
    return parseSettings(text);
  } catch {
    return { settings: DEFAULTS, invalid: true };
  }
}
