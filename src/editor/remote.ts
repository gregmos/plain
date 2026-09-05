// Find, replace and `go to line` are app commands (spec §12), so their chords
// live in the registry and the editor only answers the events. Without this
// the same chord would be handled twice: once by CodeMirror, once by the app.

import { findNext, findPrevious, gotoLine, openSearchPanel } from "@codemirror/search";
import type { Extension } from "@codemirror/state";
import { ViewPlugin } from "@codemirror/view";
import { FIND, FIND_STEP, GOTO_LINE_PROMPT, REPLACE } from "../read/events";
import { openReplace } from "./findPanel";

export const remoteCommands: Extension = ViewPlugin.define((view) => {
  const find = () => openSearchPanel(view);
  const replace = () => openReplace(view);
  const step = (event: Event) => {
    const direction = (event as CustomEvent<1 | -1>).detail;
    if (direction < 0) findPrevious(view);
    else findNext(view);
  };
  const goto = () => gotoLine(view);

  window.addEventListener(FIND, find);
  window.addEventListener(REPLACE, replace);
  window.addEventListener(FIND_STEP, step);
  window.addEventListener(GOTO_LINE_PROMPT, goto);

  return {
    destroy() {
      window.removeEventListener(FIND, find);
      window.removeEventListener(REPLACE, replace);
      window.removeEventListener(FIND_STEP, step);
      window.removeEventListener(GOTO_LINE_PROMPT, goto);
    },
  };
});
