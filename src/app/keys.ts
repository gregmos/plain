// One keyboard layer for the whole app. Chords are written the way they are
// spelled in the spec and bound by physical key (see chords.ts).

import { tinykeys } from "tinykeys";
import { chordToPattern, matchesChord } from "./chords";
import {
  closeActive,
  openFile,
  openLibrary,
  toggleAlwaysOnTop,
  toggleFullscreen,
} from "./commands";
import { toggleLineNumbers } from "../editor/setup";
import { emitRerender } from "../read/events";
import { goBack, goForward } from "../read/history";
import { useStore } from "./store";

/**
 * WebView2 keeps its own accelerators (spec §12 leaves them on for zoom), but
 * these four must not reach it — they are ours, or they would reload the app.
 */
const SWALLOW = ["Ctrl+F", "Ctrl+P", "Ctrl+G", "F5"];

/** chord -> action. New shortcuts go here and nowhere else. */
function bindings(): Record<string, () => void> {
  const store = () => useStore.getState();
  return {
    "Ctrl+/": () => store().toggleMode(),
    "Ctrl+Alt+1": () => store().setMode("read"),
    "Ctrl+Alt+2": () => store().setMode("edit"),
    "Ctrl+\\": () => store().toggleRail(),
    "Ctrl+Shift+D": () => store().toggleTheme(),
    F11: () => void toggleFullscreen(),
    "Ctrl+Shift+A": () => void toggleAlwaysOnTop(),
    "Ctrl+O": () => void openFile(),
    "Ctrl+Alt+O": () => void openLibrary(),
    "Ctrl+W": () => closeActive(),
    "Ctrl+Shift+9": () => toggleLineNumbers(),
    "Ctrl+Tab": () => store().cycleDoc(1),
    "Ctrl+Shift+Tab": () => store().cycleDoc(-1),
    "Alt+Left": () => goBack(),
    "Alt+Right": () => goForward(),
    F5: () => emitRerender(),
  };
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
