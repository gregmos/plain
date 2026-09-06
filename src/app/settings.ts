// %APPDATA%\Plain\settings.json — read once at startup (spec §10).
// Broken JSON falls back to defaults and raises a banner; a single bad value
// falls back to that key's default and the rest of the file still applies.

import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { inTauri } from "./env";
import { isMac } from "./platform";

export type Theme = "system" | "light" | "dark";
export type IndentUnit = "tab" | 2 | 4;
export type Eol = "crlf" | "lf";

export interface Settings {
  appearance: { theme: Theme; fontSize: number; contentWidth: number };
  read: { codeWrap: boolean };
  edit: { lineNumbers: boolean; indentUnit: IndentUnit };
  files: { newFileEol: Eol; autosave: number };
  library: { extensions: string[] };
}

export const SETTINGS_FILE = "settings.json";

/** The reading column, in px (spec §3, §10). The `−`/`+` step is the same. */
export const CONTENT_WIDTH = { min: 440, max: 1400, step: 20 } as const;

/**
 * A 560px column leaves a 1920px screen mostly empty, so a wide screen starts
 * wider. Only on a first run: once settings.json exists it says what the
 * width is, whatever screen you moved to since (spec §3).
 */
const WIDE_SCREEN = 1600;
const WIDE_DEFAULT = 720;

/** macOS writes LF, Windows writes CRLF (spec §13a). */
export function defaultEol(): Eol {
  return isMac() ? "lf" : "crlf";
}

/**
 * A fresh copy of the defaults. A function, not a constant, because one of
 * them follows the platform and the tests drive both (review #8).
 */
export function defaultSettings(): Settings {
  return {
    appearance: { theme: "system", fontSize: 13.5, contentWidth: 560 },
    read: { codeWrap: false },
    edit: { lineNumbers: true, indentUnit: 2 },
    files: { newFileEol: defaultEol(), autosave: 0 },
    library: { extensions: [".md", ".markdown"] },
  };
}

/** The shape, for anything that only needs a value to fall back to. */
export const DEFAULTS: Settings = defaultSettings();

/**
 * The defaults a first run gets: the same ones, with a wider column on a wide
 * screen. The width is a parameter so the tests can drive both.
 */
export function firstRunSettings(
  screenWidth: number = typeof screen === "undefined" ? 0 : screen.width,
): Settings {
  const settings = defaultSettings();
  if (screenWidth >= WIDE_SCREEN) settings.appearance.contentWidth = WIDE_DEFAULT;
  return settings;
}

/** `files.autosave` bounds, from spec §2a. 0 turns it off. */
export const AUTOSAVE = { min: 0, max: 60, step: 1 };

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
      contentWidth: num(
        appearance["contentWidth"],
        CONTENT_WIDTH.min,
        CONTENT_WIDTH.max,
        DEFAULTS.appearance.contentWidth,
      ),
    },
    read: { codeWrap: bool(read["codeWrap"], DEFAULTS.read.codeWrap) },
    edit: {
      lineNumbers: bool(edit["lineNumbers"], DEFAULTS.edit.lineNumbers),
      indentUnit: oneOf(edit["indentUnit"], ["tab", 2, 4] as const, DEFAULTS.edit.indentUnit),
    },
    files: {
      // An explicit choice in the file wins; the fallback follows the platform.
      newFileEol: oneOf(files["newFileEol"], ["crlf", "lf"] as const, defaultEol()),
      // Seconds; whole ones only, and 0 means off (spec §2a).
      autosave: Math.round(
        num(files["autosave"], AUTOSAVE.min, AUTOSAVE.max, DEFAULTS.files.autosave),
      ),
    },
    library: { extensions: validExtensions },
  };
}

export interface ParsedSettings {
  settings: Settings;
  invalid: boolean;
}

/** Parses the file text. Unparseable JSON -> defaults + invalid flag. */
export function parseSettings(text: string): ParsedSettings {
  if (text.trim() === "") return { settings: defaultSettings(), invalid: false };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { settings: defaultSettings(), invalid: true };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { settings: defaultSettings(), invalid: true };
  }
  return { settings: normalizeSettings(raw), invalid: false };
}

/** Reads settings.json from the app data dir. Missing file is not an error. */
export async function loadSettings(): Promise<ParsedSettings> {
  if (!inTauri) return { settings: firstRunSettings(), invalid: false };
  try {
    const file = await settingsPath();
    // No file is a first run; an unreadable one is not, so only this path
    // gets the wide-screen column.
    if (!(await exists(file))) return { settings: firstRunSettings(), invalid: false };
    return parseSettings(await readTextFile(file));
  } catch {
    return { settings: defaultSettings(), invalid: true };
  }
}

/* ------------------------------------------------------------------ write */

/**
 * The whole file, all eight keys, indented by two — writing only what changed
 * would need a diff against the file on disk, and the file is eight lines.
 */
export function serializeSettings(settings: Settings): string {
  return JSON.stringify(
    {
      appearance: {
        theme: settings.appearance.theme,
        fontSize: settings.appearance.fontSize,
        contentWidth: settings.appearance.contentWidth,
      },
      read: { codeWrap: settings.read.codeWrap },
      edit: {
        lineNumbers: settings.edit.lineNumbers,
        indentUnit: settings.edit.indentUnit,
      },
      files: { newFileEol: settings.files.newFileEol, autosave: settings.files.autosave },
      library: { extensions: settings.library.extensions },
    },
    null,
    2,
  );
}

/**
 * Where settings, drafts, the session and the history live. Rust decides —
 * a `data` folder next to plain.exe makes it portable (spec §2a) — and the
 * answer cannot change while the app runs, so it is asked for once.
 *
 * It lives here rather than in fs.ts because fs.ts imports the store, and the
 * store imports this module.
 */
let dataFolder: Promise<string> | null = null;

export function dataDir(): Promise<string> {
  dataFolder ??= invoke<string>("data_path").catch(() => appDataDir());
  return dataFolder;
}

export async function settingsPath(): Promise<string> {
  return join(await dataDir(), SETTINGS_FILE);
}

const SAVE_DEBOUNCE = 300;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Settings | null = null;
/** The write in flight, so `flushSettings` can wait for it. */
let writing: Promise<void> = Promise.resolve();

async function write(settings: Settings): Promise<void> {
  try {
    const path = await settingsPath();
    await invoke("write_text_atomic", { path, text: serializeSettings(settings) });
  } catch (error) {
    console.error("couldn't write settings.json", error);
  }
}

/** Takes whatever is waiting and writes it, keeping the writes in order. */
function drain(): void {
  const next = pending;
  pending = null;
  clearTimeout(timer);
  timer = undefined;
  if (!next) return;
  writing = writing.then(() => write(next));
}

/**
 * Debounced: the settings screen changes a value on every click, and the
 * `−/+` buttons are held down. Goes through the same temp-and-replace as
 * every other file we write. Not imported by store.ts's dependencies, so
 * this module stays free of the fs.ts -> store.ts cycle.
 */
export function saveSettings(settings: Settings): void {
  if (!inTauri) return;
  pending = settings;
  clearTimeout(timer);
  timer = setTimeout(drain, SAVE_DEBOUNCE);
}

/**
 * Closing time: a setting changed less than 300 ms ago must still reach the
 * disk (spec §10). Writes what is waiting and waits for it, and for anything
 * already on its way.
 */
export async function flushSettings(): Promise<void> {
  drain();
  await writing;
}
