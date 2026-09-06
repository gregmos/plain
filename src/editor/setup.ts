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
import { commands } from "../app/registry";
import { parseChord, toCode, type Chord } from "../app/chords";
import { isMac } from "../app/platform";
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
  placeholder,
  type DecorationSet,
  type KeyBinding,
  type ViewUpdate,
} from "@codemirror/view";
import type { Settings } from "../app/settings";
import type { Doc } from "../app/store";
import { activeDoc, useStore } from "../app/store";
import { detectIndent, urlPaste } from "./commands";
import { pasteImage } from "./images";
import { editorKeymap } from "./keymap";
import { findPanel } from "./findPanel";
import { remoteCommands } from "./remote";
import { richConf } from "./rich";
import { storeSync } from "./sync";
import { formatToolbar } from "./toolbar";
import { editorTheme, highlightStyle } from "./theme";

export const gutterConf = new Compartment();
/** Save As turns a read-only copy into an editable file (review #5). */
export const readOnlyConf = new Compartment();

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

/** Mockup 1d, for a document with nothing in it yet (UX #25). */
export const PLACEHOLDER = "type here, or just keep writing.";
export const placeholderHint = placeholder(PLACEHOLDER);

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

/* ------------------------------------------------------------- key sharing */

/**
 * Whatever the command registry binds is the registry's (spec §12): leaving
 * the same chord in CodeMirror's own keymaps runs it twice, once through
 * tinykeys and once here (review #12, #16, #8). The list is taken from the
 * registry itself, so a new chord there cannot go on to collide quietly.
 */
function chordKey(chord: Chord): string {
  return `${chord.ctrl ? 1 : 0}${chord.shift ? 1 : 0}${chord.alt ? 1 : 0}${chord.meta ? 1 : 0}:${chord.code}`;
}

/** CodeMirror spells them `Mod-f`, `Shift-Alt-ArrowUp`, `F3`. */
function cmChord(key: string): Chord | null {
  const parts = key.split("-");
  const last = parts.pop() || (parts.length > 0 ? "-" : "");
  if (!last) return null;
  const chord: Chord = { ctrl: false, shift: false, alt: false, meta: false, code: "" };
  for (const part of parts) {
    // CodeMirror's `Mod` is ⌘ on macOS and Ctrl everywhere else — the same
    // rule the registry's `Ctrl` follows (spec §13a).
    if (part === "Mod") {
      if (isMac()) chord.meta = true;
      else chord.ctrl = true;
    } else if (part === "Ctrl" || part === "Control") chord.ctrl = true;
    else if (part === "Shift") chord.shift = true;
    else if (part === "Alt") chord.alt = true;
    else if (part === "Meta" || part === "Cmd") chord.meta = true;
    else if (part !== "") return null;
  }
  try {
    chord.code = toCode(last);
  } catch {
    return null;
  }
  return chord;
}

let shared: readonly KeyBinding[] | null = null;

function appKeymap(): readonly KeyBinding[] {
  if (shared) return shared;
  const owned = new Set<string>();
  for (const command of commands) {
    if (!command.chord) continue;
    try {
      for (const chord of [command.chord, ...(command.chords ?? [])]) {
        if (chord) owned.add(chordKey(parseChord(chord)));
      }
    } catch {
      // A chord the app cannot parse cannot collide either.
    }
  }
  const taken = (key: string | undefined, shift: boolean): boolean => {
    if (!key) return false;
    const chord = cmChord(key);
    if (!chord) return false;
    return owned.has(chordKey(chord)) || (shift && owned.has(chordKey({ ...chord, shift: true })));
  };
  shared = [
    ...closeBracketsKeymap,
    ...historyKeymap,
    ...searchKeymap,
    ...defaultKeymap,
  ].filter(
    (binding) =>
      !taken(binding.key, binding.shift !== undefined) &&
      // Each platform has its own override field in a CM6 binding.
      !taken(isMac() ? binding.mac : binding.win, binding.shift !== undefined),
  );
  return shared;
}

/** The first image on the clipboard, if that is what was copied (§2a). */
function clipboardImage(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of data.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/**
 * Paste: an image goes into `assets/` and leaves a link behind (spec §2a);
 * a URL over selected text becomes a link (§5.2). This replaces the language
 * pack's own handler so both also work in a file too big for highlighting.
 */
const pasteLink = EditorView.domEventHandlers({
  paste(event, view) {
    const image = clipboardImage(event.clipboardData);
    if (image) {
      const doc = activeDoc(useStore.getState());
      if (doc) {
        event.preventDefault();
        void pasteImage(view, doc, image);
        return true;
      }
    }
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
    readOnlyConf.of(EditorState.readOnly.of(doc.readOnly)),
    // Microcopy is lowercase latin (spec §1.4); this is CodeMirror's own.
    EditorState.phrases.of({ "Go to line": "go to line", go: "go", close: "×" }),
    EditorView.lineWrapping,
    placeholderHint,
    lineLook,
    codeFolding(),
    closeBrackets(),
    search({ top: true, createPanel: findPanel }),
    gutterConf.of(gutterExtension(lineNumbersOn())),
    // Rich is the same buffer with the markers hidden; the mode switch just
    // reconfigures this (spec §5.3).
    richConf.of([]),
    indentUnit.of(detectIndent(doc.text, unit)),
    languageExtension(doc.large),
    pasteLink,
    storeSync,
    remoteCommands,
    formatToolbar,
    editorKeymap(),
    keymap.of([...appKeymap()]),
  ];
}
