// Shortcuts are bound by KeyboardEvent.code so they keep working in a
// Russian layout (spec §12). This turns readable chords like "Ctrl+Shift+F"
// into a physical-key description, and into a tinykeys pattern.

import { isMac } from "./platform";

export interface Chord {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  code: string;
}

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const PUNCT: Record<string, string> = {
  "/": "Slash",
  "\\": "Backslash",
  "[": "BracketLeft",
  "]": "BracketRight",
  ",": "Comma",
  ".": "Period",
  ";": "Semicolon",
  "'": "Quote",
  "`": "Backquote",
  "-": "Minus",
  "=": "Equal",
};

const NAMED: Record<string, string> = {
  space: "Space",
  enter: "Enter",
  return: "Enter",
  esc: "Escape",
  escape: "Escape",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  del: "Delete",
  insert: "Insert",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
};

/** Maps one chord token to a KeyboardEvent.code. */
export function toCode(token: string): string {
  if (/^[a-z]$/i.test(token)) return "Key" + token.toUpperCase();
  if (/^[0-9]$/.test(token)) return "Digit" + token;
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(token)) return "F" + token.slice(1);
  const punct = PUNCT[token];
  if (punct) return punct;
  const named = NAMED[token.toLowerCase()];
  if (named) return named;
  // Already a code ("Backquote", "NumpadAdd", ...).
  if (/^[A-Z][A-Za-z0-9]*$/.test(token)) return token;
  throw new Error(`unknown key token: ${token}`);
}

/**
 * Modifier vocabulary (spec §13a):
 *
 * - `Ctrl` — the platform's primary modifier: `Ctrl` on Windows, ⌘ on macOS.
 *   Almost every chord in the registry is written with it.
 * - `Cmd` / `Meta` / `Win` — literally the meta key, on both platforms.
 * - `Control` — literally the control key, on both. Only macOS needs it, for
 *   the handful of system chords that really are ⌃ (fullscreen).
 * - `Alt` / `Option` — ⌥ on macOS.
 */
export function parseChord(chord: string): Chord {
  const parts = chord.split("+").map((p) => p.trim());
  const last = parts.pop();
  if (!last) throw new Error(`empty chord: ${chord}`);

  const out: Chord = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    code: toCode(last),
  };
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case "ctrl":
      case "mod":
        if (isMac()) out.meta = true;
        else out.ctrl = true;
        break;
      case "control":
        out.ctrl = true;
        break;
      case "shift":
        out.shift = true;
        break;
      case "alt":
      case "option":
        out.alt = true;
        break;
      case "meta":
      case "cmd":
      case "win":
        out.meta = true;
        break;
      default:
        throw new Error(`unknown modifier: ${part}`);
    }
  }
  return out;
}

/* --------------------------------------------------------------- display */

/** `KeyB` -> `B`, `Comma` -> `,`, `ArrowLeft` -> `←`, for the macOS glyphs. */
const KEY_GLYPHS: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Enter: "↩",
  Tab: "⇥",
  Escape: "⎋",
  Backspace: "⌫",
  Delete: "⌦",
  Space: "space",
};

function keyLabel(code: string): string {
  const glyph = KEY_GLYPHS[code];
  if (glyph) return glyph;
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (/^F\d+$/.test(code)) return code;
  for (const [punct, name] of Object.entries(PUNCT)) {
    if (name === code) return punct;
  }
  return code;
}

/**
 * How a chord is written in the menu, the palette and the shortcuts screen.
 * Windows spells it out in the app's lowercase microcopy (`ctrl shift s`);
 * macOS uses the glyphs in Apple's order, ⌃⌥⇧⌘, with nothing between them.
 */
export function chordText(chord: string): string {
  if (!isMac()) {
    return chord
      .split("+")
      .map((part) => part.trim().toLowerCase())
      .join(" ");
  }
  const c = parseChord(chord);
  return (
    (c.ctrl ? "⌃" : "") +
    (c.alt ? "⌥" : "") +
    (c.shift ? "⇧" : "") +
    (c.meta ? "⌘" : "") +
    keyLabel(c.code)
  );
}

/** Exact match, including "no other modifier is held". */
export function matchesChord(chord: string | Chord, event: KeyLike): boolean {
  const c = typeof chord === "string" ? parseChord(chord) : chord;
  return (
    event.code === c.code &&
    event.ctrlKey === c.ctrl &&
    event.shiftKey === c.shift &&
    event.altKey === c.alt &&
    event.metaKey === c.meta
  );
}

/**
 * tinykeys pattern for the same chord. tinykeys compares the last token
 * against event.code as-is, so passing "KeyF" binds the physical key.
 */
export function chordToPattern(chord: string): string {
  const c = parseChord(chord);
  const mods: string[] = [];
  if (c.ctrl) mods.push("Control");
  if (c.alt) mods.push("Alt");
  if (c.shift) mods.push("Shift");
  if (c.meta) mods.push("Meta");
  return [...mods, c.code].join("+");
}
