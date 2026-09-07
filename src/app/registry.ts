// Every command the app has, in one table. The keyboard layer (keys.ts), the
// quick-search palette (`>`), and the menu bar all read this list, so a chord
// or a title is written exactly once (spec §4, §12).

import {
  closeWindow,
  copyPath,
  copyPlainText,
  exitApp,
  exportHtmlFile,
  exportPdf,
  exportPlainText,
  newDoc,
  openNewWindow,
  openFile,
  openFolderSearch,
  openLibrary,
  openQuickSearch,
  openSettingsFile,
  refresh,
  revealInExplorer,
  showAbout,
  toggleAlwaysOnTop,
  toggleFullscreen,
} from "./commands";
import { closeActive } from "./close";
import { zoomIn, zoomOut, zoomReset } from "./zoom";
import { runEditorCommand } from "../editor";
import { redo, undo } from "@codemirror/commands";
import {
  CALLOUT_TYPES,
  clearHeading,
  cycleList,
  insertFootnote,
  insertLink,
  insertRule,
  insertTable,
  insertWikilink,
  toggleBold,
  toggleBulletList,
  toggleCallout,
  toggleCheckbox,
  toggleCodeBlock,
  toggleHeading,
  toggleHighlight,
  toggleInlineCode,
  toggleItalic,
  toggleMathBlock,
  toggleMathInline,
  toggleOrderedList,
  toggleQuote,
  toggleStrike,
  toggleTaskList,
} from "../editor/commands";
import { insertImageFromFile } from "../editor/images";
import { reopenAs, saveActive, saveAs } from "./save";
import { toggleLineNumbers } from "../editor/setup";
import { goBack, goForward } from "../read/history";
import {
  emitFind,
  emitFindStep,
  emitGotoLinePrompt,
  emitReplace,
} from "../read/events";
import { isMac } from "./platform";
import { activeDoc, useStore } from "./store";

export interface Command {
  /** Stable id; the menu and the palette address commands by it. */
  id: string;
  /** Microcopy: lowercase latin (spec §1.4). */
  title: string;
  /** Spelled the way the spec spells it; parsed by chords.ts. */
  chord?: string;
  /**
   * Extra chords that do the same thing. `F8` is taken by a global hotkey on
   * some machines, so focus mode answers to two.
   */
  chords?: string[];
  /**
   * A chord somebody else already owns — the editor's keymap (spec §5.2) or
   * WebView2 (§12). The menu shows it; binding it here would run it twice.
   */
  hint?: string;
  run: () => void | Promise<void>;
  /** False hides the command from the palette; chords still fire. */
  when?: () => boolean;
}

const store = () => useStore.getState();
const hasDoc = () => store().activeId !== null;
const hasFile = () => activeDoc(store())?.path != null;
const hasLibrary = () => store().libraryPath !== null;
// Rich is edit with the markers hidden: every editing command works there
// too (spec §5.3).
const inEdit = () => {
  const mode = activeDoc(store())?.mode;
  return mode === "edit" || mode === "rich";
};

export const commands: Command[] = [
  /* ------------------------------------------------------------- file */
  { id: "file.new", title: "new file", chord: "Ctrl+N", run: () => newDoc() },
  {
    id: "file.newWindow",
    title: "new window",
    chord: "Ctrl+Shift+N",
    run: () => void openNewWindow(),
  },
  { id: "file.open", title: "open file…", chord: "Ctrl+O", run: () => void openFile() },
  {
    id: "file.openLibrary",
    title: "open library…",
    chord: "Ctrl+Alt+O",
    run: () => void openLibrary(),
  },
  { id: "file.save", title: "save", chord: "Ctrl+S", run: () => void saveActive(), when: hasDoc },
  {
    id: "file.saveAs",
    title: "save as…",
    chord: "Ctrl+Shift+S",
    run: () => {
      const id = store().activeId;
      if (id) void saveAs(id);
    },
    when: hasDoc,
  },
  {
    id: "file.history",
    title: "version history…",
    run: () => {
      const s = store();
      if (s.screen === "history") s.closeScreen();
      else if (s.activeId) s.setHistory(s.activeId);
    },
    when: hasDoc,
  },
  {
    id: "file.copyPlain",
    title: "copy as plain text",
    chord: "Ctrl+Shift+Alt+C",
    run: () => void copyPlainText(),
    when: hasDoc,
  },
  {
    id: "file.exportText",
    title: "export as text…",
    run: () => void exportPlainText(),
    when: hasDoc,
  },
  {
    id: "file.exportHtml",
    title: "export as html…",
    run: () => void exportHtmlFile(),
    when: hasDoc,
  },
  {
    id: "file.exportPdf",
    title: "print / export as pdf…",
    chord: "Ctrl+P",
    run: () => void exportPdf(),
    when: hasDoc,
  },
  { id: "file.close", title: "close", chord: "Ctrl+W", run: () => closeActive(), when: hasDoc },
  {
    id: "file.closeWindow",
    title: "close window",
    chord: "Ctrl+Shift+W",
    run: () => void closeWindow(),
  },
  {
    id: "file.reload",
    title: "reload from disk",
    chord: "F5",
    run: () => refresh(),
    when: hasDoc,
  },
  {
    id: "file.reopenUtf8",
    title: "reopen as utf-8",
    run: () => reopenAs("utf-8"),
    when: hasFile,
  },
  {
    id: "file.reopenCp1251",
    title: "reopen as cp1251",
    run: () => reopenAs("windows-1251"),
    when: hasFile,
  },
  {
    id: "file.reopenUtf16",
    title: "reopen as utf-16",
    run: () => reopenAs("utf-16le"),
    when: hasFile,
  },
  {
    id: "file.reveal",
    title: "reveal in explorer",
    chord: "Ctrl+Shift+E",
    run: () => void revealInExplorer(),
    when: () => hasFile() || store().treeSelected !== null,
  },
  {
    id: "file.copyPath",
    title: "copy path",
    chord: "Ctrl+Shift+C",
    run: () => void copyPath(),
    when: () => hasFile() || store().treeSelected !== null,
  },
  { id: "file.exit", title: "exit", run: () => void exitApp() },

  /* ------------------------------------------------------------- view */
  { id: "view.toggleMode", title: "toggle read/edit", chord: "Ctrl+/", run: () => store().toggleMode(), when: hasDoc },
  { id: "view.read", title: "read", chord: "Ctrl+Alt+1", run: () => store().setMode("read"), when: hasDoc },
  { id: "view.edit", title: "edit", chord: "Ctrl+Alt+2", run: () => store().setMode("edit"), when: hasDoc },
  { id: "view.rich", title: "rich", chord: "Ctrl+Alt+3", run: () => store().setMode("rich"), when: hasDoc },
  {
    id: "view.split",
    title: "split",
    chord: "Ctrl+Shift+\\",
    run: () => store().setMode("split"),
    when: hasDoc,
  },
  { id: "view.toggleRail", title: "toggle rail", chord: "Ctrl+\\", run: () => store().toggleRail() },
  {
    id: "view.library",
    title: "library",
    chord: "Ctrl+Alt+L",
    run: () => store().toggleScreen("library"),
    when: () => store().libraryPath !== null,
  },
  { id: "view.files", title: "files", run: () => store().setRailView("files") },
  { id: "view.outline", title: "outline", run: () => store().setRailView("outline") },
  { id: "view.toggleTheme", title: "toggle theme", chord: "Ctrl+Shift+D", run: () => store().toggleTheme() },
  { id: "view.themeLight", title: "light theme", run: () => store().setTheme("light") },
  { id: "view.themeDark", title: "dark theme", run: () => store().setTheme("dark") },
  { id: "view.themeSystem", title: "system theme", run: () => store().setTheme("system") },
  { id: "view.lineNumbers", title: "line numbers", chord: "Ctrl+Shift+9", run: () => toggleLineNumbers() },
  { id: "view.alwaysOnTop", title: "always on top", chord: "Ctrl+Shift+A", run: () => void toggleAlwaysOnTop() },
  { id: "view.fullscreen", title: "fullscreen", chord: "F11", run: () => void toggleFullscreen() },
  {
    id: "view.focus",
    title: "focus",
    chord: "F8",
    chords: ["Ctrl+Alt+F"],
    run: () => store().setFocus(!store().focus),
  },
  { id: "view.zoomIn", title: "zoom in", hint: "Ctrl+=", run: () => zoomIn() },
  { id: "view.zoomOut", title: "zoom out", hint: "Ctrl+-", run: () => zoomOut() },
  { id: "view.zoomReset", title: "reset zoom", hint: "Ctrl+0", run: () => zoomReset() },

  /* ------------------------------------------------------------- edit */
  // The chords below belong to the editor's keymap (keymap.ts); they are
  // `hint`s so the menu can show them without the app binding them twice.
  { id: "edit.undo", title: "undo", hint: "Ctrl+Z", run: () => void runEditorCommand(undo), when: inEdit },
  { id: "edit.redo", title: "redo", hint: "Ctrl+Shift+Z", run: () => void runEditorCommand(redo), when: inEdit },
  { id: "edit.bold", title: "bold", hint: "Ctrl+B", run: () => void runEditorCommand(toggleBold), when: inEdit },
  { id: "edit.italic", title: "italic", hint: "Ctrl+I", run: () => void runEditorCommand(toggleItalic), when: inEdit },
  {
    id: "edit.code",
    title: "inline code",
    hint: "Ctrl+E",
    run: () => void runEditorCommand(toggleInlineCode),
    when: inEdit,
  },
  {
    id: "edit.codeBlock",
    title: "code block",
    hint: "Ctrl+Shift+`",
    run: () => void runEditorCommand(toggleCodeBlock),
    when: inEdit,
  },
  {
    id: "edit.link",
    title: "link…",
    hint: "Ctrl+Shift+K",
    run: () => void runEditorCommand(insertLink),
    when: inEdit,
  },
  {
    id: "edit.quote",
    title: "quote",
    hint: "Ctrl+Shift+Q",
    run: () => void runEditorCommand(toggleQuote),
    when: inEdit,
  },
  {
    id: "edit.list",
    title: "list",
    hint: "Ctrl+Shift+L",
    run: () => void runEditorCommand(cycleList),
    when: inEdit,
  },
  {
    id: "edit.checkbox",
    title: "checkbox",
    hint: "Ctrl+Enter",
    run: () => void runEditorCommand(toggleCheckbox),
    when: inEdit,
  },
  ...[1, 2, 3, 4, 5, 6].map((level) => ({
    id: `edit.heading${level}`,
    title: `heading ${level}`,
    hint: `Ctrl+${level}`,
    run: () => void runEditorCommand(toggleHeading(level)),
    when: inEdit,
  })),
  { id: "edit.headingOff", title: "no heading", run: () => void runEditorCommand(clearHeading), when: inEdit },

  /* the insert group (spec §5.2, v2.6) */
  { id: "edit.strike", title: "strikethrough", hint: "Ctrl+Alt+S", run: () => void runEditorCommand(toggleStrike), when: inEdit },
  { id: "edit.highlight", title: "highlight", hint: "Ctrl+Alt+H", run: () => void runEditorCommand(toggleHighlight), when: inEdit },
  { id: "edit.bulletList", title: "bulleted list", hint: "Ctrl+Alt+U", run: () => void runEditorCommand(toggleBulletList), when: inEdit },
  { id: "edit.orderedList", title: "numbered list", hint: "Ctrl+Alt+E", run: () => void runEditorCommand(toggleOrderedList), when: inEdit },
  { id: "edit.taskList", title: "task list", hint: "Ctrl+Alt+C", run: () => void runEditorCommand(toggleTaskList), when: inEdit },
  { id: "edit.table", title: "table", hint: "Ctrl+Alt+T", run: () => void runEditorCommand(insertTable), when: inEdit },
  { id: "edit.image", title: "image…", hint: "Ctrl+Alt+I", run: () => void insertImageFromFile(), when: inEdit },
  { id: "edit.rule", title: "horizontal rule", hint: "Ctrl+Alt+-", run: () => void runEditorCommand(insertRule), when: inEdit },
  { id: "edit.footnote", title: "footnote", hint: "Ctrl+Alt+N", run: () => void runEditorCommand(insertFootnote), when: inEdit },
  { id: "edit.mathInline", title: "math inline", hint: "Ctrl+Alt+M", run: () => void runEditorCommand(toggleMathInline), when: inEdit },
  { id: "edit.mathBlock", title: "math block", hint: "Ctrl+Alt+Shift+M", run: () => void runEditorCommand(toggleMathBlock), when: inEdit },
  { id: "edit.wikilink", title: "wikilink", hint: "Ctrl+Alt+W", run: () => void runEditorCommand(insertWikilink), when: inEdit },
  ...CALLOUT_TYPES.map((type) => ({
    id: `edit.callout${type[0]?.toUpperCase()}${type.slice(1)}`,
    title: `callout: ${type}`,
    run: () => void runEditorCommand(toggleCallout(type)),
    when: inEdit,
  })),

  /* ------------------------------------------------------- navigation */
  { id: "nav.quickSearch", title: "quick search", chord: "Ctrl+K", run: () => openQuickSearch() },
  { id: "nav.palette", title: "command palette", chord: "Ctrl+Shift+P", run: () => openQuickSearch(">") },
  { id: "nav.find", title: "find", chord: "Ctrl+F", run: () => emitFind(), when: hasDoc },
  { id: "nav.replace", title: "replace", chord: "Ctrl+H", run: () => emitReplace(), when: hasDoc },
  { id: "nav.findNext", title: "find next", chord: "F3", run: () => emitFindStep(1), when: hasDoc },
  { id: "nav.findPrevious", title: "find previous", chord: "Shift+F3", run: () => emitFindStep(-1), when: hasDoc },
  { id: "nav.gotoLine", title: "go to line", chord: "Ctrl+G", run: () => emitGotoLinePrompt(), when: inEdit },
  {
    id: "nav.searchInFolder",
    title: "search in folder",
    chord: "Ctrl+Shift+F",
    run: () => openFolderSearch(),
    when: hasLibrary,
  },
  { id: "nav.nextDoc", title: "next file", chord: "Ctrl+Tab", run: () => store().cycleDoc(1), when: hasDoc },
  {
    id: "nav.previousDoc",
    title: "previous file",
    chord: "Ctrl+Shift+Tab",
    run: () => store().cycleDoc(-1),
    when: hasDoc,
  },
  { id: "nav.back", title: "back", chord: "Alt+Left", run: () => goBack(), when: hasDoc },
  { id: "nav.forward", title: "forward", chord: "Alt+Right", run: () => goForward(), when: hasDoc },

  /* ------------------------------------------------------------- help */
  {
    id: "app.settings",
    title: "settings…",
    chord: "Ctrl+,",
    run: () => store().toggleScreen("settings"),
  },
  {
    id: "app.settingsFile",
    title: "open settings.json",
    run: () => void openSettingsFile(),
  },
  {
    id: "app.shortcuts",
    title: "shortcuts",
    chord: "F1",
    run: () => store().toggleScreen("shortcuts"),
  },
  { id: "app.about", title: "about", run: () => void showAbout() },
];

/**
 * The chords macOS spells differently (spec §13a, review #5–#7). Everything
 * else is one string on both platforms, because `Ctrl` already means ⌘ there
 * (chords.ts).
 *
 * | id              | windows        | macOS | why                             |
 * |-----------------|----------------|-------|---------------------------------|
 * | nav.back        | Alt+Left       | ⌥⌘←   | ⌥←/→ move by word on macOS      |
 * | nav.forward     | Alt+Right      | ⌥⌘→   | and ⌘[/⌘] belong to the editor  |
 * | view.fullscreen | F11            | ⌃⌘F   | the system chord                |
 * | nav.replace     | Ctrl+H         | ⌥⌘F   | ⌘H is Hide, in the native menu  |
 * | nav.nextDoc     | Ctrl+Tab       | ⌃⇥    | ⌘⇥ switches applications        |
 * | nav.previousDoc | Ctrl+Shift+Tab | ⌃⇧⇥   | same                            |
 * | view.zoomIn     | (hint)         | ⌘=    | WKWebView has no zoom keys of   |
 * | view.zoomOut    | (hint)         | ⌘-    | its own; WebView2 does, so on   |
 * | view.zoomReset  | (hint)         | ⌘0    | Windows these stay hints        |
 *
 * ⌘[ / ⌘] stay with the editor's indent, the way VS Code has them: indenting
 * is a per-keystroke thing and history is not. Both would also collide — the
 * editor keymap and the app layer would each fire once.
 */
export const macOverrides: Record<string, string> = {
  "nav.back": "Ctrl+Alt+Left",
  "nav.forward": "Ctrl+Alt+Right",
  "view.fullscreen": "Control+Cmd+F",
  "nav.replace": "Ctrl+Alt+F",
  "nav.nextDoc": "Control+Tab",
  "nav.previousDoc": "Control+Shift+Tab",
  "view.zoomIn": "Ctrl+=",
  "view.zoomOut": "Ctrl+-",
  "view.zoomReset": "Ctrl+0",
};

/**
 * Commands whose extra chords are dropped on macOS. Focus mode answers to
 * `Ctrl+Alt+F` as well as `F8` on Windows, and that is Replace's chord here;
 * `F8` alone is enough, and it is not a system key on macOS.
 */
export const macDropsAliases = new Set(["view.focus"]);

/** Exported so the table can be tested without re-importing this module. */
export function applyMacChords(list: Command[]): void {
  for (const command of list) {
    const override = macOverrides[command.id];
    if (override) command.chord = override;
    if (macDropsAliases.has(command.id)) delete command.chords;
  }
}

if (isMac()) applyMacChords(commands);

const byId = new Map(commands.map((command) => [command.id, command]));

export function command(id: string): Command | undefined {
  return byId.get(id);
}

/** What the menu and the palette show next to a title. */
export function chordOf(id: string): string | undefined {
  return byId.get(id)?.chord;
}

export function runCommand(id: string): void {
  void byId.get(id)?.run();
}

/** The palette shows what makes sense right now (spec §4). */
export function availableCommands(): Command[] {
  return commands.filter((c) => (c.when ? c.when() : true));
}
