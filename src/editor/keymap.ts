// CodeMirror matches key bindings by `key`, which breaks every letter chord
// in a Russian layout (spec §12). Our commands go through this thin layer
// instead: same chord spelling as the app, matched by KeyboardEvent.code.

import {
  deleteLine,
  indentLess,
  indentMore,
  redo,
  selectAll,
  undo,
} from "@codemirror/commands";
import { foldCode, unfoldCode } from "@codemirror/language";
import { selectNextOccurrence } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { ViewPlugin, type Command } from "@codemirror/view";
import { matchesChord, parseChord } from "../app/chords";
import { insertImageFromFile } from "./images";
import {
  cycleList,
  insertFootnote,
  insertLink,
  insertRule,
  insertTable,
  insertWikilink,
  tabIndent,
  toggleBold,
  toggleCheckbox,
  toggleCodeBlock,
  toggleHeading,
  toggleBulletList,
  toggleHighlight,
  toggleInlineCode,
  toggleItalic,
  toggleMathBlock,
  toggleMathInline,
  toggleOrderedList,
  toggleQuote,
  toggleStrike,
  toggleTaskList,
} from "./commands";

export interface CodeBinding {
  chord: string;
  run: Command;
}

/**
 * Runs the first binding whose physical chord matches. This listens on the
 * editor in the capture phase rather than through CodeMirror's own keydown
 * handling, because the app swallows Ctrl+F/Ctrl+G with preventDefault on
 * window (spec §12) and CodeMirror skips its handlers once that is set.
 */
export function codeKeymap(bindings: CodeBinding[]): Extension {
  const compiled = bindings.map((b) => ({ chord: parseChord(b.chord), run: b.run }));
  return ViewPlugin.define((view) => {
    const onKeydown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      // The find panel has its own keys.
      if ((event.target as HTMLElement | null)?.closest(".cm-panels")) return;
      for (const binding of compiled) {
        if (!matchesChord(binding.chord, event)) continue;
        if (binding.run(view)) event.preventDefault();
        return;
      }
    };
    view.dom.addEventListener("keydown", onKeydown, true);
    return { destroy: () => view.dom.removeEventListener("keydown", onKeydown, true) };
  });
}

/** Chords the app layer owns; CodeMirror must keep its hands off them. */
const yieldToApp: Command = () => true;

export function editorKeymap(): Extension {
  return codeKeymap([
    // formatting (§5.2)
    { chord: "Ctrl+B", run: toggleBold },
    { chord: "Ctrl+I", run: toggleItalic },
    { chord: "Ctrl+E", run: toggleInlineCode },
    { chord: "Ctrl+Shift+`", run: toggleCodeBlock },
    { chord: "Ctrl+Shift+K", run: insertLink },
    { chord: "Ctrl+Shift+Q", run: toggleQuote },
    { chord: "Ctrl+Shift+L", run: cycleList },
    { chord: "Ctrl+Enter", run: toggleCheckbox },
    { chord: "Ctrl+1", run: toggleHeading(1) },
    { chord: "Ctrl+2", run: toggleHeading(2) },
    { chord: "Ctrl+3", run: toggleHeading(3) },
    { chord: "Ctrl+4", run: toggleHeading(4) },
    { chord: "Ctrl+5", run: toggleHeading(5) },
    { chord: "Ctrl+6", run: toggleHeading(6) },
    // v2.6: the insert group (spec §5.2).
    { chord: "Ctrl+Alt+S", run: toggleStrike },
    { chord: "Ctrl+Alt+H", run: toggleHighlight },
    { chord: "Ctrl+Alt+-", run: insertRule },
    { chord: "Ctrl+Alt+T", run: insertTable },
    {
      chord: "Ctrl+Alt+I",
      run: () => {
        void insertImageFromFile();
        return true;
      },
    },
    { chord: "Ctrl+Alt+N", run: insertFootnote },
    { chord: "Ctrl+Alt+M", run: toggleMathInline },
    { chord: "Ctrl+Alt+Shift+M", run: toggleMathBlock },
    { chord: "Ctrl+Alt+W", run: insertWikilink },
    { chord: "Ctrl+Alt+U", run: toggleBulletList },
    { chord: "Ctrl+Alt+E", run: toggleOrderedList },
    { chord: "Ctrl+Alt+C", run: toggleTaskList },

    { chord: "Ctrl+]", run: indentMore },
    { chord: "Ctrl+[", run: indentLess },
    { chord: "Tab", run: tabIndent },
    { chord: "Shift+Tab", run: indentLess },

    // editing (§12)
    { chord: "Ctrl+Z", run: undo },
    { chord: "Ctrl+Shift+Z", run: redo },
    { chord: "Ctrl+Y", run: redo },
    { chord: "Ctrl+A", run: selectAll },
    { chord: "Ctrl+D", run: selectNextOccurrence },
    { chord: "Ctrl+Shift+X", run: deleteLine },
    { chord: "Ctrl+Shift+[", run: foldCode },
    { chord: "Ctrl+Shift+]", run: unfoldCode },

    // Find, replace and go-to-line are app commands now: the registry owns
    // their chords and remote.ts answers the events (spec §12).

    // Ctrl+/ is the app's read/edit switch, not CodeMirror's comment toggle.
    { chord: "Ctrl+/", run: yieldToApp },
  ]);
}
