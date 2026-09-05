// One keyboard layer for the whole app. There are no chords here: every
// binding comes from the command registry (spec §12), so a shortcut and the
// menu entry that shows it can never drift apart. Tree keys (`F2`, `Delete`,
// the arrows) are local to the tree and live in the rail.

import { tinykeys } from "tinykeys";
import { chordToPattern, matchesChord } from "./chords";
import { commands } from "./registry";

/**
 * WebView2 keeps its own accelerators (spec §12 leaves them on for zoom), but
 * these must not reach it — they are ours, or they would reload or print.
 */
const SWALLOW = [
  "Ctrl+F",
  "Ctrl+P",
  "Ctrl+G",
  "F5",
  "Ctrl+S",
  "Ctrl+Shift+S",
  "Ctrl+N",
  "Ctrl+O",
  "Ctrl+H",
  "Ctrl+K",
];

/** chord -> action, straight out of the registry. */
export function bindings(): Record<string, () => void> {
  const map: Record<string, () => void> = {};
  for (const command of commands) {
    if (!command.chord) continue;
    map[command.chord] = () => void command.run();
  }
  return map;
}

export function installKeys(): () => void {
  const swallow = (event: KeyboardEvent) => {
    if (SWALLOW.some((chord) => matchesChord(chord, event))) event.preventDefault();
  };
  window.addEventListener("keydown", swallow, { capture: true });

  // WebView2 would otherwise show its own context menu (spec §12). Bubble
  // phase, so an element that has its own menu can stop this first.
  const noMenu = (event: MouseEvent) => event.preventDefault();
  window.addEventListener("contextmenu", noMenu);

  const map: Record<string, (event: KeyboardEvent) => void> = {};
  for (const [chord, run] of Object.entries(bindings())) {
    map[chordToPattern(chord)] = (event) => {
      event.preventDefault();
      run();
    };
  }

  const off = tinykeys(window, map, {
    // Shortcuts must keep working while the editor (contenteditable) has
    // focus, so only auto-repeat and IME composition are skipped.
    ignore: (event) => event.repeat || event.isComposing,
  });

  return () => {
    window.removeEventListener("keydown", swallow, { capture: true });
    window.removeEventListener("contextmenu", noMenu);
    off();
  };
}
