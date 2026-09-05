// What the menu bar shows (spec §4), as plain data. The bar itself is our
// own markup (ui/MenuBar.tsx) — the native Windows menu draws in Segoe UI
// with its own capitals, which does not belong in this app.
//
// Every entry names a command in the registry, so a title and a chord are
// written once and the palette, the keyboard layer and the menu agree.

import { openLibraryPath, openPaths } from "./commands";
import { basename } from "./paths";
import { command } from "./registry";
import { reopenAs } from "./save";
import type { Theme } from "./settings";
import { useStore } from "./store";
import { lineNumbersOn } from "../editor/setup";

/** Last ten of the twenty the session keeps (spec §4). */
const RECENT_IN_MENU = 10;

export interface MenuEntry {
  kind: "item";
  /** Unique inside its list; React keys and nothing else. */
  key: string;
  label: string;
  /** Shown right-aligned, lowercase: `ctrl shift s`. */
  chord?: string;
  /** Greyed out rather than hidden — the menu is also a map of the app. */
  disabled?: boolean;
  /** Draws the `●` glyph; theme, line numbers, always on top. */
  checked?: boolean;
  run: () => void;
}

export interface MenuSeparator {
  kind: "separator";
  key: string;
}

export interface MenuSubmenu {
  kind: "submenu";
  key: string;
  label: string;
  items: MenuNode[];
}

export type MenuNode = MenuEntry | MenuSeparator | MenuSubmenu;

export interface MenuSection {
  key: string;
  label: string;
  items: MenuNode[];
}

/** "Ctrl+Shift+S" -> "ctrl shift s", the way the spec writes chords. */
export function chordText(chord: string): string {
  return chord
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .join(" ");
}

let separators = 0;

function separator(): MenuSeparator {
  separators += 1;
  return { kind: "separator", key: `sep-${separators}` };
}

/** One registry command as an entry; `when()` decides enabled, not visible. */
function entry(id: string, label?: string): MenuEntry {
  const found = command(id);
  const chord = found?.chord ?? found?.hint;
  return {
    kind: "item",
    key: id,
    label: label ?? found?.title ?? id,
    ...(chord ? { chord: chordText(chord) } : {}),
    disabled: found?.when ? !found.when() : false,
    run: () => void found?.run(),
  };
}

function recentItems(): MenuNode[] {
  const { recent } = useStore.getState();
  if (recent.length === 0) {
    return [
      { kind: "item", key: "recent-empty", label: "nothing yet", disabled: true, run: () => {} },
    ];
  }
  return recent.slice(0, RECENT_IN_MENU).map((path, index) => ({
    kind: "item",
    key: `recent-${index}-${path}`,
    label: basename(path),
    run: () => void openPaths([path]),
  }));
}

function libraryItems(): MenuNode[] {
  const { recentLibraries } = useStore.getState();
  if (recentLibraries.length === 0) {
    return [
      { kind: "item", key: "libs-empty", label: "nothing yet", disabled: true, run: () => {} },
    ];
  }
  return recentLibraries.map((path, index) => ({
    kind: "item",
    key: `lib-${index}-${path}`,
    label: basename(path),
    run: () => void openLibraryPath(path),
  }));
}

function reopenItems(): MenuNode[] {
  const enabled = command("file.reopenUtf8")?.when?.() ?? true;
  const one = (key: string, label: string, encoding: string): MenuEntry => ({
    kind: "item",
    key,
    label,
    disabled: !enabled,
    run: () => reopenAs(encoding),
  });
  return [
    one("reopen-utf8", "utf-8", "utf-8"),
    one("reopen-cp1251", "cp1251", "windows-1251"),
    one("reopen-utf16", "utf-16", "utf-16le"),
  ];
}

/** A theme entry carries the `●` for the one in force. */
function themeItem(name: Theme, id: string): MenuEntry {
  return { ...entry(id, name), key: `theme-${name}`, checked: useStore.getState().theme === name };
}

/**
 * The whole bar, rebuilt on every render — it is a few dozen objects, and
 * this way `disabled` and the ticks are never stale.
 */
export function menuModel(): MenuSection[] {
  separators = 0;
  const state = useStore.getState();

  return [
    {
      key: "file",
      label: "file",
      items: [
        entry("file.new"),
        entry("file.open"),
        entry("file.openLibrary"),
        { kind: "submenu", key: "recent", label: "recent", items: recentItems() },
        { kind: "submenu", key: "libraries", label: "recent libraries", items: libraryItems() },
        separator(),
        entry("file.save"),
        entry("file.saveAs"),
        entry("file.copyPlain"),
        {
          kind: "submenu",
          key: "export",
          label: "export",
          items: [
            entry("file.exportHtml", "html…"),
            entry("file.exportText", "text…"),
            entry("file.exportPdf", "pdf…"),
          ],
        },
        { kind: "submenu", key: "reopen", label: "reopen as", items: reopenItems() },
        separator(),
        entry("file.history"),
        separator(),
        entry("file.close"),
        entry("file.exit"),
      ],
    },
    {
      key: "edit",
      // undo/redo run against the live CodeMirror view, not the system edit
      // command, which the editor would never see (spec §5.2).
      label: "edit",
      items: [
        entry("edit.undo"),
        entry("edit.redo"),
        separator(),
        entry("nav.find"),
        entry("nav.replace"),
        separator(),
        entry("edit.bold"),
        entry("edit.italic"),
        entry("edit.code"),
        entry("edit.link"),
        entry("edit.quote"),
        entry("edit.list"),
        {
          kind: "submenu",
          key: "heading",
          label: "heading",
          items: [
            ...[1, 2, 3, 4, 5, 6].map((level) => entry(`edit.heading${level}`, String(level))),
            separator(),
            entry("edit.headingOff", "off"),
          ],
        },
      ],
    },
    {
      key: "view",
      label: "view",
      items: [
        entry("view.read"),
        entry("view.edit"),
        entry("view.rich"),
        entry("view.split"),
        separator(),
        entry("view.library"),
        entry("view.files"),
        entry("view.outline"),
        { ...entry("view.lineNumbers"), checked: lineNumbersOn() },
        {
          kind: "submenu",
          key: "theme",
          label: "theme",
          items: [
            themeItem("system", "view.themeSystem"),
            themeItem("light", "view.themeLight"),
            themeItem("dark", "view.themeDark"),
          ],
        },
        separator(),
        { ...entry("view.alwaysOnTop"), checked: state.alwaysOnTop },
        entry("view.fullscreen"),
        { ...entry("view.focus"), checked: state.focus },
        separator(),
        entry("view.zoomIn"),
        entry("view.zoomOut"),
        entry("view.zoomReset"),
      ],
    },
    {
      key: "help",
      label: "help",
      items: [entry("app.settings"), entry("app.shortcuts"), entry("app.about")],
    },
  ];
}
