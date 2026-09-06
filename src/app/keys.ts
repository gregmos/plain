// One keyboard layer for the whole app. There are no chords here: every
// binding comes from the command registry (spec §12), so a shortcut and the
// menu entry that shows it can never drift apart. Tree keys (`F2`, `Delete`,
// the arrows) are local to the tree and live in the rail.

import { tinykeys } from "tinykeys";
import { chordToPattern, matchesChord } from "./chords";
import { isMac } from "./platform";
import { commands } from "./registry";
import { useStore } from "./store";

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
  "F1",
];

/**
 * ⌘H belongs to Hide on macOS and replace has moved off it (review #5), so
 * there is nothing of ours to protect there any more.
 */
function swallowed(): string[] {
  return isMac() ? SWALLOW.filter((chord) => chord !== "Ctrl+H") : SWALLOW;
}

/** chord -> action, straight out of the registry. */
export function bindings(): Record<string, () => void> {
  const map: Record<string, () => void> = {};
  for (const command of commands) {
    for (const chord of [command.chord, ...(command.chords ?? [])]) {
      if (chord) map[chord] = () => void command.run();
    }
  }
  return map;
}

/**
 * A dialog is the one question on screen, so nothing else answers the
 * keyboard while it is up: `Ctrl+K` used to open quick search on top of it,
 * and a mode chord used to switch modes underneath it (review #5). `Esc` is
 * the exception, and the dialog handles that itself.
 */
function dialogHasTheKeyboard(): boolean {
  return useStore.getState().dialog !== null;
}

export function installKeys(): () => void {
  const swallow = (event: KeyboardEvent) => {
    // The accelerators still have to be kept off WebView2 while a dialog is
    // up — `Ctrl+P` would print the dialog — even though we run nothing.
    if (swallowed().some((chord) => matchesChord(chord, event))) event.preventDefault();
  };
  window.addEventListener("keydown", swallow, { capture: true });

  // WebView2's own menu is suppressed everywhere: read and the editor each
  // have their own, in the app's own type, and both stop this event before
  // it reaches here.
  const noMenu = (event: MouseEvent) => event.preventDefault();
  window.addEventListener("contextmenu", noMenu);

  const map: Record<string, (event: KeyboardEvent) => void> = {};
  for (const [chord, run] of Object.entries(bindings())) {
    map[chordToPattern(chord)] = (event) => {
      event.preventDefault();
      if (dialogHasTheKeyboard()) return;
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
