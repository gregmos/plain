// The whole app state. `text` is already on the document so waves 2 and 3
// can fill it in without reshaping anything.

import { create } from "zustand";
import { normalizeEol, type Eol } from "./eol";
import { DEFAULTS, saveSettings, type Settings, type Theme } from "./settings";
import { applyAppearance, applyReading, applyTheme, flipTheme, resolveTheme } from "./theme";
import { basename, pathKey } from "./paths";

/** Over this, highlighting is off and read renders on demand (spec §8). */
export const LARGE_TEXT = 2 * 1024 * 1024;

export type Mode = "read" | "edit";
export type RailView = "files" | "outline";

export interface Heading {
  level: number;
  text: string;
  /** GitHub-style slug, same as the id on the rendered heading. */
  id: string;
  /** 1-based source line, for read -> edit "same heading" scrolling. */
  line: number;
}

export interface Doc {
  id: string;
  /** null while the buffer has never been written to disk. */
  path: string | null;
  title: string;
  /** Always LF inside the app; the file's own style is `eol` (spec §8). */
  text: string;
  /** The text as it is on disk. `dirty` is measured against this. */
  savedText: string;
  dirty: boolean;
  mode: Mode;
  readOnly: boolean;
  /** Filled by the read pipeline; drives the outline (wave 2). */
  headings: Heading[];
  /** 1-based caret position from the editor (wave 3); null in read. */
  caret: { line: number; col: number } | null;
  /** Bigger than LARGE_TEXT: no highlighting, `large file` in the status bar. */
  large: boolean;
  /** encoding_rs label of the file: `utf-8`, `utf-16le`, `windows-1251`… */
  encoding: string;
  bom: boolean;
  /** The style a save writes back — the dominant one in the file. */
  eol: Eol;
  /** The file mixes styles; saving normalizes them, with a message (§1.3). */
  mixedEol: boolean;
  finalNewline: boolean;
  /** blake3 of the bytes this buffer came from; null when never on disk. */
  baseHash: string | null;
  /** The file was removed from under us; the buffer stays (spec §6). */
  deleted: boolean;
  /**
   * Bumped by every change to `text`. A decision taken before an `await` —
   * "this buffer is clean, the disk version may replace it" — is only still
   * true if this has not moved since (spec §8).
   */
  revision: number;
  /** Bytes the encoding could not decode; saving would make that permanent. */
  decodeErrors: boolean;
}

/** The parts of a document a caller has to give; the rest has defaults. */
type DocSeed = Partial<Doc> & { id: string; path: string | null; text: string };

export function makeDoc(seed: DocSeed): Doc {
  return {
    title: seed.path ? basename(seed.path) : "Untitled",
    savedText: normalizeEol(seed.text),
    dirty: false,
    mode: "read",
    readOnly: false,
    headings: [],
    caret: null,
    large: seed.text.length > LARGE_TEXT,
    encoding: "utf-8",
    bom: false,
    eol: "crlf",
    mixedEol: false,
    finalNewline: false,
    baseHash: null,
    deleted: false,
    revision: 0,
    decodeErrors: false,
    ...seed,
  };
}

/** A draft found in %APPDATA% at startup (spec §8). */
export interface Recovery {
  file: string;
  path: string | null;
  title: string;
  savedAt: number;
}

export interface DialogAction {
  label: string;
  run: () => void;
}

/** Modal, 420px, text actions, `Esc` cancels (spec §4). */
export interface Dialog {
  title: string;
  lines?: string[];
  actions: DialogAction[];
  cancel: () => void;
}

/** One entry of the library tree (spec §6); folders carry their children. */
export interface TreeNode {
  name: string;
  /** Absolute path, as Rust spelled it. */
  path: string;
  /** Path relative to the library root, `/` separated — the tree's identity. */
  rel: string;
  dir: boolean;
  /** The folder would not be listed; `children` is unknown, not empty (#20). */
  unreadable: boolean;
  children: TreeNode[];
}

/** The row the tree is about to create; `Enter` in the inline field makes it. */
export interface TreeDraft {
  /** Absolute path of the folder it goes into. */
  parent: string;
  kind: "file" | "folder";
}

/** `Ctrl+K`; `seed` is `>` when the palette was asked for (spec §4). */
export interface QuickSearch {
  seed: string;
}

export interface BannerAction {
  label: string;
  run: () => void;
}

export interface Banner {
  id: string;
  text: string;
  actions?: BannerAction[];
}

interface AppState {
  docs: Doc[];
  activeId: string | null;
  settings: Settings;
  theme: Theme;
  resolvedTheme: "light" | "dark";
  railCollapsed: boolean;
  railView: RailView;
  libraryPath: string | null;
  recent: string[];
  /** Transient status-bar message; clears itself after 3 s. */
  message: string | null;
  /** Transient document state (`reloaded from disk`, `recreated`), 3 s. */
  note: string | null;
  banner: Banner | null;
  alwaysOnTop: boolean;
  dialog: Dialog | null;
  /** Drafts waiting to be restored or discarded; null once that is done. */
  recovery: Recovery[] | null;

  /* ------------------------------------------------- the library (wave 5) */

  /** Roots of the library tree; empty without a library. */
  tree: TreeNode[];
  /** How many files the tree holds, for the rail footer. */
  treeFiles: number;
  /** Relative paths of the folders that are folded shut; kept in the session. */
  collapsed: string[];
  /** Absolute path of the row the keyboard is on. */
  treeSelected: string | null;
  /** A new file or folder is being named inline; null the rest of the time. */
  treeDraft: TreeDraft | null;
  /** Absolute path of the row being renamed inline. */
  treeRenaming: string | null;
  /** The quick-search modal, or null when it is closed. */
  quickSearch: QuickSearch | null;
  /** `Ctrl+Shift+F` takes over the content area (spec §7). */
  folderSearch: boolean;

  /* ------------------------------------------ menu and settings (wave 5b) */

  /** The settings screen takes over the content area too (spec §10). */
  settingsOpen: boolean;
  /** WebView2 zoom factor the view menu drives; 1 is 100% (spec §4). */
  zoom: number;

  applySettings: (settings: Settings) => void;
  /** A change made on the settings screen: applied now, written to disk. */
  changeSettings: (settings: Settings) => void;
  setSettingsOpen: (open: boolean) => void;
  setZoom: (zoom: number) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  syncSystemTheme: (resolved: "light" | "dark") => void;
  toggleRail: () => void;
  setRailCollapsed: (collapsed: boolean) => void;
  setRailView: (view: RailView) => void;
  setLibraryPath: (path: string | null) => void;
  openDoc: (doc: Doc) => void;
  /** Generic per-document patch — the way read/edit waves update a doc. */
  updateDoc: (id: string, patch: Partial<Omit<Doc, "id">>) => void;
  /** Save As: the same buffer, under a new file (spec §6). */
  renameDoc: (id: string, path: string) => string;
  activate: (id: string) => void;
  closeDoc: (id: string) => void;
  cycleDoc: (step: number) => void;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
  setMessage: (message: string | null) => void;
  setNote: (note: string | null) => void;
  showBanner: (banner: Banner) => void;
  dismissBanner: (id?: string) => void;
  setAlwaysOnTop: (on: boolean) => void;
  setDialog: (dialog: Dialog | null) => void;
  setRecovery: (recovery: Recovery[] | null) => void;
  setRecent: (recent: string[]) => void;

  setTree: (tree: TreeNode[]) => void;
  setCollapsed: (collapsed: string[]) => void;
  toggleCollapsed: (rel: string) => void;
  setTreeSelected: (path: string | null) => void;
  setTreeDraft: (draft: TreeDraft | null) => void;
  setTreeRenaming: (path: string | null) => void;
  setQuickSearch: (quickSearch: QuickSearch | null) => void;
  setFolderSearch: (open: boolean) => void;
}

function countFiles(nodes: TreeNode[]): number {
  let total = 0;
  for (const node of nodes) total += node.dir ? countFiles(node.children) : 1;
  return total;
}

let messageTimer: ReturnType<typeof setTimeout> | undefined;
let noteTimer: ReturnType<typeof setTimeout> | undefined;

/** A conflict must not be pushed aside by a draft-write complaint (§8). */
const BANNER_RANK: Record<string, number> = { conflict: 3, "save-failed": 2, drafts: 1 };
const rank = (id: string): number => BANNER_RANK[id] ?? 0;

export const useStore = create<AppState>()((set, get) => ({
  docs: [],
  activeId: null,
  settings: DEFAULTS,
  theme: DEFAULTS.appearance.theme,
  resolvedTheme: resolveTheme(DEFAULTS.appearance.theme),
  railCollapsed: false,
  railView: "files",
  libraryPath: null,
  recent: [],
  message: null,
  note: null,
  banner: null,
  alwaysOnTop: false,
  dialog: null,
  recovery: null,
  tree: [],
  treeFiles: 0,
  collapsed: [],
  treeSelected: null,
  treeDraft: null,
  treeRenaming: null,
  quickSearch: null,
  folderSearch: false,
  settingsOpen: false,
  zoom: 1,

  applySettings: (settings) => {
    applyTheme(settings.appearance.theme);
    applyAppearance(settings.appearance);
    applyReading(settings.read);
    set({
      settings,
      theme: settings.appearance.theme,
      resolvedTheme: resolveTheme(settings.appearance.theme),
    });
  },

  // Same as applySettings, plus the write. Startup uses the other one: it
  // would otherwise write the file back the moment it read it.
  changeSettings: (settings) => {
    get().applySettings(settings);
    saveSettings(settings);
  },

  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setZoom: (zoom) => set({ zoom }),

  // The theme is a setting like any other, so picking one writes the file
  // (spec §10) — from the status bar, Ctrl+Shift+D or the view menu.
  setTheme: (theme) => {
    const settings = { ...get().settings, appearance: { ...get().settings.appearance, theme } };
    applyTheme(theme);
    set({ settings, theme, resolvedTheme: resolveTheme(theme) });
    saveSettings(settings);
  },

  /** Toggling out of "system" lands on the opposite of what is on screen. */
  toggleTheme: () => get().setTheme(flipTheme(get().resolvedTheme)),

  syncSystemTheme: (resolved) => {
    if (get().theme === "system") set({ resolvedTheme: resolved });
  },

  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  setRailCollapsed: (railCollapsed) => set({ railCollapsed }),
  setRailView: (railView) => set({ railView }),
  setLibraryPath: (libraryPath) => set({ libraryPath }),

  openDoc: (doc) => {
    if (get().docs.some((d) => d.id === doc.id)) {
      set({ activeId: doc.id });
      return;
    }
    const path = doc.path;
    set((s) => ({
      docs: [...s.docs, doc],
      activeId: doc.id,
      recent: path ? [path, ...s.recent.filter((p) => p !== path)].slice(0, 20) : s.recent,
    }));
  },

  updateDoc: (id, patch) =>
    set((s) => ({
      docs: s.docs.map((d) => {
        if (d.id !== id) return d;
        const next = { ...d, ...patch };
        // Every real change to the text moves the revision on; §8 leans on it.
        if (patch.text !== undefined && patch.text !== d.text) {
          next.revision = d.revision + 1;
        }
        return next;
      }),
    })),

  renameDoc: (id, path) => {
    const next = pathKey(path);
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === id ? { ...d, id: next, path, title: basename(path) } : d,
      ),
      activeId: s.activeId === id ? next : s.activeId,
      recent: [path, ...s.recent.filter((p) => p !== path)].slice(0, 20),
    }));
    return next;
  },

  activate: (id) => set({ activeId: id }),

  closeDoc: (id) =>
    set((s) => {
      const index = s.docs.findIndex((d) => d.id === id);
      if (index < 0) return {};
      const docs = s.docs.filter((d) => d.id !== id);
      if (s.activeId !== id) return { docs };
      const next = docs[Math.min(index, docs.length - 1)];
      return { docs, activeId: next ? next.id : null };
    }),

  cycleDoc: (step) => {
    const { docs, activeId } = get();
    if (docs.length < 2) return;
    const index = docs.findIndex((d) => d.id === activeId);
    const next = docs[(index + step + docs.length) % docs.length];
    if (next) set({ activeId: next.id });
  },

  setMode: (mode) =>
    set((s) => ({
      docs: s.docs.map((d) => (d.id === s.activeId ? { ...d, mode } : d)),
    })),

  toggleMode: () =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === s.activeId ? { ...d, mode: d.mode === "read" ? "edit" : "read" } : d,
      ),
    })),

  setMessage: (message) => {
    clearTimeout(messageTimer);
    set({ message });
    if (message !== null) {
      messageTimer = setTimeout(() => set({ message: null }), 3000);
    }
  },

  setNote: (note) => {
    clearTimeout(noteTimer);
    set({ note });
    if (note !== null) {
      noteTimer = setTimeout(() => set({ note: null }), 3000);
    }
  },

  // Only one banner at a time (spec §4), so the more urgent one wins.
  showBanner: (banner) =>
    set((s) => (s.banner && rank(s.banner.id) > rank(banner.id) ? {} : { banner })),
  dismissBanner: (id) => set((s) => (id && s.banner?.id !== id ? {} : { banner: null })),
  setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
  setDialog: (dialog) => set({ dialog }),
  setRecovery: (recovery) => set({ recovery }),
  setRecent: (recent) => set({ recent }),

  setTree: (tree) => set({ tree, treeFiles: countFiles(tree) }),
  setCollapsed: (collapsed) => set({ collapsed }),
  toggleCollapsed: (rel) =>
    set((s) => ({
      collapsed: s.collapsed.includes(rel)
        ? s.collapsed.filter((r) => r !== rel)
        : [...s.collapsed, rel],
    })),
  setTreeSelected: (treeSelected) => set({ treeSelected }),
  setTreeDraft: (treeDraft) => set({ treeDraft }),
  setTreeRenaming: (treeRenaming) => set({ treeRenaming }),
  setQuickSearch: (quickSearch) => set({ quickSearch }),
  setFolderSearch: (folderSearch) => set({ folderSearch }),
}));

export function activeDoc(state: AppState): Doc | null {
  return state.docs.find((d) => d.id === state.activeId) ?? null;
}
