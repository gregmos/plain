// One place that assembles the CodeMirror extensions. The only compartment
// is the line-number gutter, which Ctrl+Shift+9 flips while the app runs.

import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  deleteMarkupBackward,
  insertNewlineContinueMarkupCommand,
  markdown,
  markdownLanguage,
} from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { codeFolding, indentUnit, syntaxHighlighting, syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { search, searchKeymap } from "@codemirror/search";
import {
  Compartment,
  EditorState,
  Prec,
  RangeSetBuilder,
  countColumn,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  drawSelection,
  dropCursor,
  keymap,
  lineNumbers,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import type { Settings } from "../app/settings";
import type { Doc } from "../app/store";
import { useStore } from "../app/store";
import { detectIndent, urlPaste } from "./commands";
import { editorKeymap } from "./keymap";
import { findPanel } from "./findPanel";
import { remoteCommands } from "./remote";
import { storeSync } from "./sync";
import { formatToolbar } from "./toolbar";
import { editorTheme, highlightStyle } from "./theme";

export const gutterConf = new Compartment();

/* ------------------------------------------------- soft wrap continuation */

// Leading blockquote/list markup, so a wrapped line lines up with its text.
const MARKUP = /^(?:[ \t]*(?:>[ \t]?|[-*+][ \t]+|\d+[.)][ \t]+))*[ \t]*/;

/** Last line of a leading `---` block; 0 when the file has no front matter. */
function frontMatterEnd(state: EditorState): number {
  if (state.doc.lines < 2 || !/^---\s*$/.test(state.doc.line(1).text)) return 0;
  const limit = Math.min(state.doc.lines, 200);
  for (let n = 2; n <= limit; n += 1) {
    if (/^(---|\.\.\.)\s*$/.test(state.doc.line(n).text)) return n;
  }
  return 0;
}

/** Fenced code, so the whole block gets one background like read does. */
function inCode(state: EditorState, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") return true;
  }
  return false;
}

function lineDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { state } = view;
  const frontMatter = frontMatterEnd(state);
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = state.doc.lineAt(pos);
      const markup = MARKUP.exec(line.text)?.[0] ?? "";
      const width = markup ? Math.min(countColumn(markup, state.tabSize), 24) : 0;
      const cls =
        line.number <= frontMatter
          ? "cm-frontmatter"
          : inCode(state, line.from)
            ? "cm-code"
            : "";
      if (width > 0 || cls) {
        builder.add(
          line.from,
          line.from,
          Decoration.line({
            class: cls || undefined,
            attributes:
              width > 0
                ? { style: `text-indent:-${width}ch;padding-left:${width}ch` }
                : undefined,
          }),
        );
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const lineLook = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = lineDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = lineDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/* ----------------------------------------------------- line numbers (§12) */

// Ctrl+Shift+9 flips them for the session; settings.json is the starting point.
let numbersOverride: boolean | null = null;
const numbersListeners = new Set<() => void>();

export function lineNumbersOn(): boolean {
  return numbersOverride ?? useStore.getState().settings.edit.lineNumbers;
}

export function toggleLineNumbers(): void {
  numbersOverride = !lineNumbersOn();
  for (const listener of numbersListeners) listener();
}

export function onLineNumbers(listener: () => void): () => void {
  numbersListeners.add(listener);
  return () => numbersListeners.delete(listener);
}

/**
 * The settings screen moved the base, so the session override is stale — the
 * setting is what the user just looked at (spec §10).
 */
export function syncLineNumbers(): void {
  numbersOverride = null;
  for (const listener of numbersListeners) listener();
}

export function gutterExtension(on: boolean): Extension {
  return on ? lineNumbers() : [];
}

/* ------------------------------------------------------------- assembling */

const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Enter continues the list, the quote or the checkbox; on an empty item it
// takes a level off instead of loosening the list (spec §5.2).
const markupKeymap = Prec.high(
  keymap.of([
    { key: "Enter", run: insertNewlineContinueMarkupCommand({ nonTightLists: false }) },
    { key: "Backspace", run: deleteMarkupBackward },
  ]),
);

// Find, replace and go to line belong to the command registry (spec §12);
// leaving them in CodeMirror's keymap would run each of them twice, once
// through the registry and once here (review #12).
const REGISTRY_CHORDS = new Set(["Mod-f", "Mod-h", "F3", "Shift-F3", "Mod-g", "Shift-Mod-g", "Mod-Alt-g"]);
const ownSearchKeymap = searchKeymap.filter((binding) => !REGISTRY_CHORDS.has(binding.key ?? ""));

/**
 * A URL pasted over selected text becomes a link (spec §5.2). This replaces
 * the language pack's own handler so it also works in a file too big for
 * highlighting.
 */
const pasteLink = EditorView.domEventHandlers({
  paste(event, view) {
    const pasted = event.clipboardData?.getData("text/plain");
    if (!pasted) return false;
    const spec = urlPaste(view.state, pasted);
    if (!spec) return false;
    event.preventDefault();
    view.dispatch(spec);
    return true;
  },
});

/** No language on big files: no parse, no highlighting (spec §8). */
function languageExtension(large: boolean): Extension {
  if (large) return [];
  return [
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
      addKeymap: false,
      pasteURLAsLink: false,
    }),
    markupKeymap,
  ];
}

export function editorExtensions(doc: Doc, settings: Settings): Extension {
  const unit = settings.edit.indentUnit === "tab" ? "\t" : " ".repeat(settings.edit.indentUnit);
  return [
    editorTheme,
    syntaxHighlighting(highlightStyle),
    history(),
    drawSelection({ cursorBlinkRate: reducedMotion ? 0 : 1100 }),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    EditorView.clickAddsSelectionRange.of((event) => event.altKey),
    EditorState.readOnly.of(doc.readOnly),
    // Microcopy is lowercase latin (spec §1.4); this is CodeMirror's own.
    EditorState.phrases.of({ "Go to line": "go to line", go: "go", close: "×" }),
    EditorView.lineWrapping,
    lineLook,
    codeFolding(),
    closeBrackets(),
    search({ top: true, createPanel: findPanel }),
    gutterConf.of(gutterExtension(lineNumbersOn())),
    indentUnit.of(detectIndent(doc.text, unit)),
    languageExtension(doc.large),
    pasteLink,
    storeSync,
    remoteCommands,
    formatToolbar,
    editorKeymap(),
    keymap.of([...closeBracketsKeymap, ...historyKeymap, ...ownSearchKeymap, ...defaultKeymap]),
  ];
}
