// The whole app state. `text` is already on the document so waves 2 and 3
// can fill it in without reshaping anything.

import { create } from "zustand";
import { normalizeEol, type Eol } from "./eol";
import type { FileInfo } from "./fs";
import { DEFAULTS, saveSettings, type Settings, type Theme } from "./settings";
import { applyAppearance, applyReading, applyTheme, flipTheme, resolveTheme } from "./theme";
import { basename, pathKey } from "./paths";

/** Over this, highlighting is off and read renders on demand (spec §8). */
export const LARGE_TEXT = 2 * 1024 * 1024;

export type Mode = "read" | "edit" | "rich" | "split";

/**
 * The screens that take the content area over from the document. One at a
 * time: opening any of them closes whichever was up, so two can never stack
 * with the second invisible underneath the first (spec §4).
 */
export type Screen =
  | "settings"
  | "shortcuts"
  | "library"
  | "history"
  | "comparison"
  | "folderSearch";

/** No screen, and none of the data one of them was showing. */
const CLOSED = {
  screen: null,
  libraryFilterTag: null,
  history: null,
  comparison: null,
} as const;

/**
 * The one place `docs` and `activeId` change. A screen over the content area
 * is about the document under it, so asking for a document takes the screen
 * away — and so does the document behind `history` or `compare` leaving,
 * even when some other document was the active one (review #6). Every path
 * goes through here, so no way of opening, closing or switching documents
 * can be the one that was forgotten.
 *
 * `asked` is what the caller wanted: opening, activating and cycling all
 * mean "show me this document"; closing one does not, so that only takes the
 * screen away when the screen has nothing left to show.
 */
function toDocument(
  s: AppState,
  next: { docs?: Doc[]; activeId?: string | null },
  asked = true,
): Partial<AppState> {
  const docs = next.docs ?? s.docs;
  const activeId = next.activeId === undefined ? s.activeId : next.activeId;
  const orphaned =
    (s.history !== null && !docs.some((d) => d.id === s.history)) ||
    (s.comparison !== null && !docs.some((d) => d.id === s.comparison?.id));
  const leave = asked || activeId !== s.activeId || orphaned;
  return leave ? { docs, activeId, ...CLOSED } : { docs, activeId };
}

export type RailView = "files" | "outline";

/** The rail, in px: dragged between these, `232` is the mockup (spec §4). */
export const RAIL_WIDTH = { min: 180, max: 420, default: 232 } as const;

export function clampRailWidth(width: number): number {
  if (!Number.isFinite(width)) return RAIL_WIDTH.default;
  return Math.round(Math.min(RAIL_WIDTH.max, Math.max(RAIL_WIDTH.min, width)));
}

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
  /**
   * Label of the action that gets the focus. The default is the last one,
   * which is `cancel` everywhere: a dialog opens under whichever key was
   * pressed, and `Enter` must not be the answer that destroys something.
   * Only "unsaved work" names one — there `save` is the safe answer.
   */
  safe?: string;
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
  /** Files carry both dates for the library screen; folders carry 0 (§2a). */
  mtimeMs: number;
  ctimeMs: number;
  children: TreeNode[];
}

/** What the library screen sorts by (spec §2a). */
export type LibrarySort = "modified" | "name" | "created";

/** One tag of the library, with the files it appears in (spec §2a). */
export interface TagCount {
  /** Lowercase, without the `#`. */
  tag: string;
  /** Every file it is in, however many are listed in `files`. */
  count: number;
  files: string[];
  /** `files` is shorter than `count`: filtering on it shows only part. */
  truncated: boolean;
}

/** A line in another file that points at the open one (spec §2a). */
export interface Backlink {
  path: string;
  rel: string;
  name: string;
  /** 1-based. */
  line: number;
  text: string;
}

/** The row the tree is about to create; `Enter` in the inline field makes it. */
export interface TreeDraft {
  /** Absolute path of the folder it goes into. */
  parent: string;
  kind: "file" | "folder";
}

/** What the diff screen is comparing; `left` is the older of the two. */
export interface Comparison {
  /** The document the buffer belongs to. */
  id: string;
  leftLabel: string;
  left: string;
  rightLabel: string;
  right: string;
  /** `take disk` / `take snapshot`: what replaces the buffer. */
  takeLabel: string;
  /**
   * The left side is the file as it is on disk, so taking it is a reload —
   * base hash and all. A snapshot only replaces the buffer (spec §2a).
   */
  fromDisk: boolean;
  /**
   * The file exactly as it was read for this comparison. Taking it applies
   * this version, not whatever the disk holds by then (review #2).
   */
  diskInfo?: FileInfo;
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

/** How many banners fit under the mode bar before they are the screen. */
export const BANNER_LIMIT = 2;

/** Below this the rail takes too much of the window to be worth its width. */
export const NARROW_WINDOW = 700;

/**
 * What a window of this width should do with the rail. Returns null when it
 * should do nothing — which is most resize events, and every one where the
 * rail was collapsed by hand: a window that grows must not reopen a rail the
 * reader closed, only the one it closed itself.
 */
export function railForWidth(
  width: number,
  rail: { collapsed: boolean; auto: boolean },
): { railCollapsed: boolean; railAuto: boolean } | null {
  if (width < NARROW_WINDOW) {
    return rail.collapsed ? null : { railCollapsed: true, railAuto: true };
  }
  return rail.collapsed && rail.auto ? { railCollapsed: false, railAuto: false } : null;
}

interface AppState {
  docs: Doc[];
  activeId: string | null;
  settings: Settings;
  theme: Theme;
  resolvedTheme: "light" | "dark";
  railCollapsed: boolean;
  /** The rail was collapsed by the window being narrow, not by the reader. */
  railAuto: boolean;
  railView: RailView;
  /** Dragged width of the rail, kept for the session (spec §4). */
  railWidth: number;
  /** Editor's share of the width in split; the session keeps it (§2a). */
  splitRatio: number;
  libraryPath: string | null;
  recent: string[];
  /** Transient status-bar message; clears itself after 3 s. */
  message: string | null;
  /** Transient document state (`reloaded from disk`, `recreated`), 3 s. */
  note: string | null;
  /** Most urgent first; only the first `BANNER_LIMIT` are on screen. */
  banners: Banner[];
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
  /** Which screen is over the document, or null when the document shows. */
  screen: Screen | null;

  /* ---------------------------------------------- history and diff (v0.2) */

  /** Id of the document the history screen lists. Data, not visibility. */
  history: string | null;
  /** The two texts the diff screen shows. Data, not visibility. */
  comparison: Comparison | null;

  /* ------------------------------------------------ the library (v0.2) */

  librarySort: LibrarySort;
  /** Only files carrying this tag are listed; null shows all of them. */
  libraryFilterTag: string | null;
  /** Every tag in the library, most used first. */
  tags: TagCount[];
  /** Lines pointing at the active document; the `links here` rail section. */
  backlinks: Backlink[];

  /* ------------------------------------------ menu and settings (wave 5b) */

  focus: boolean;
  /** WebView2 zoom factor the view menu drives; 1 is 100% (spec §4). */
  zoom: number;
  /** Folders opened as a library lately, newest first (5). */
  recentLibraries: string[];

  applySettings: (settings: Settings) => void;
  /** A change made on the settings screen: applied now, written to disk. */
  changeSettings: (settings: Settings) => void;
  /** Shows one screen over the document, closing whichever was up. */
  openScreen: (screen: Screen) => void;
  /** Back to the document. */
  closeScreen: () => void;
  /** The command that opened a screen closes it again (spec §4). */
  toggleScreen: (screen: Screen) => void;
  /** Focus mode hides the chrome (spec §2a); not kept in the session. */
  setFocus: (focus: boolean) => void;
  setZoom: (zoom: number) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  syncSystemTheme: (resolved: "light" | "dark") => void;
  toggleRail: () => void;
  setRailCollapsed: (collapsed: boolean) => void;
  setRailView: (view: RailView) => void;
  /** Collapses the rail on a narrow window, and opens it again when it grows. */
  fitRail: (width: number) => void;
  /** Out-of-range values are clamped, so a dragged edge cannot lose the rail. */
  setRailWidth: (width: number) => void;
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
  /** Share of the width the editor takes in split (spec §2a). */
  setSplitRatio: (ratio: number) => void;
  toggleMode: () => void;
  setMessage: (message: string | null) => void;
  setNote: (note: string | null) => void;
  showBanner: (banner: Banner) => void;
  dismissBanner: (id?: string) => void;
  setAlwaysOnTop: (on: boolean) => void;
  setDialog: (dialog: Dialog | null) => void;
  setRecovery: (recovery: Recovery[] | null) => void;
  setRecent: (recent: string[]) => void;
  setRecentLibraries: (paths: string[]) => void;
  rememberLibrary: (path: string) => void;
  /** Drops a path that turned out not to exist any more (spec §4). */
  forgetRecent: (path: string) => void;

  setTree: (tree: TreeNode[]) => void;
  setCollapsed: (collapsed: string[]) => void;
  toggleCollapsed: (rel: string) => void;
  setTreeSelected: (path: string | null) => void;
  setTreeDraft: (draft: TreeDraft | null) => void;
  setTreeRenaming: (path: string | null) => void;
  setQuickSearch: (quickSearch: QuickSearch | null) => void;
  /** The history screen for one document; null closes it. */
  setHistory: (id: string | null) => void;
  /** The diff screen; null closes it, back to history when it came from there. */
  setComparison: (comparison: Comparison | null) => void;

  setLibrarySort: (sort: LibrarySort) => void;
  /** Clicking the tag that is already on takes the filter off again. */
  toggleLibraryFilter: (tag: string | null) => void;
  setTags: (tags: TagCount[]) => void;
  setBacklinks: (backlinks: Backlink[]) => void;
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
  railAuto: false,
  railView: "files",
  railWidth: RAIL_WIDTH.default,
  splitRatio: 0.5,
  libraryPath: null,
  recent: [],
  message: null,
  note: null,
  banners: [],
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
  screen: null,
  history: null,
  comparison: null,
  librarySort: "modified",
  libraryFilterTag: null,
  tags: [],
  backlinks: [],
  focus: false,
  zoom: 1,
  recentLibraries: [],

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

  openScreen: (screen) =>
    set((s) => ({
      screen,
      // A screen's data goes with it, so nothing it left behind can surface
      // under the next one: the tag filtering the library, the file whose
      // history was up, the two texts the diff held. The diff keeps the
      // history it was opened from, which is where closing it returns.
      libraryFilterTag: screen === "library" ? s.libraryFilterTag : null,
      history: screen === "history" || screen === "comparison" ? s.history : null,
      comparison: screen === "comparison" ? s.comparison : null,
    })),

  closeScreen: () => set(CLOSED),

  toggleScreen: (screen) => {
    if (get().screen === screen) get().closeScreen();
    else get().openScreen(screen);
  },
  setFocus: (focus) => set({ focus }),
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

  // Collapsing by hand settles it: the window growing again will not undo
  // a decision the reader made (spec §4).
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed, railAuto: false })),
  setRailCollapsed: (railCollapsed) => set({ railCollapsed, railAuto: false }),
  fitRail: (width) =>
    set((s) => railForWidth(width, { collapsed: s.railCollapsed, auto: s.railAuto }) ?? {}),
  setRailView: (railView) => set({ railView }),
  setRailWidth: (width) => set({ railWidth: clampRailWidth(width) }),
  setLibraryPath: (libraryPath) => set({ libraryPath }),

  openDoc: (doc) => {
    if (get().docs.some((d) => d.id === doc.id)) {
      set((s) => toDocument(s, { activeId: doc.id }));
      return;
    }
    const path = doc.path;
    set((s) => ({
      ...toDocument(s, { docs: [...s.docs, doc], activeId: doc.id }),
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

  // Choosing a document is a way back to it: whatever screen was over the
  // content area steps aside (spec §4).
  activate: (id) => set((s) => toDocument(s, { activeId: id })),

  closeDoc: (id) =>
    set((s) => {
      const index = s.docs.findIndex((d) => d.id === id);
      if (index < 0) return {};
      const docs = s.docs.filter((d) => d.id !== id);
      if (s.activeId !== id) return toDocument(s, { docs }, false);
      const next = docs[Math.min(index, docs.length - 1)];
      return toDocument(s, { docs, activeId: next ? next.id : null }, false);
    }),

  cycleDoc: (step) => {
    const { docs, activeId } = get();
    if (docs.length < 2) return;
    const index = docs.findIndex((d) => d.id === activeId);
    const next = docs[(index + step + docs.length) % docs.length];
    if (next) set((s) => toDocument(s, { activeId: next.id }));
  },

  setSplitRatio: (splitRatio) => set({ splitRatio }),

  // Picking a mode in the mode bar asks for the document, so it closes the
  // screen over it — even when there is no document to show yet (spec §4).
  setMode: (mode) =>
    set((s) => ({
      docs: s.docs.map((d) => (d.id === s.activeId ? { ...d, mode } : d)),
      ...CLOSED,
    })),

  // `Ctrl+/` is the read/edit switch (spec §4); from rich it goes to read.
  toggleMode: () =>
    set((s) => ({
      docs: s.docs.map((d) =>
        d.id === s.activeId ? { ...d, mode: d.mode === "read" ? "edit" : "read" } : d,
      ),
      ...CLOSED,
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

  showBanner: (banner) =>
    set((s) => {
      // Everything but the conflict banner can be waved away, and putting
      // that here rather than at each call site means no banner can be
      // raised without a way to put it down.
      const dismissable =
        banner.id === "conflict" || banner.actions?.some((a) => a.label === "dismiss")
          ? banner
          : {
              ...banner,
              actions: [
                ...(banner.actions ?? []),
                { label: "dismiss", run: () => get().dismissBanner(banner.id) },
              ],
            };
      // The same id saying the same thing again replaces it where it stands.
      const rest = s.banners.filter((b) => b.id !== banner.id);
      // Stable sort: urgent first, and the newest of equals ahead of the
      // ones already read.
      const banners = [dismissable, ...rest].sort((a, b) => rank(b.id) - rank(a.id));
      return { banners: banners.slice(0, BANNER_LIMIT) };
    }),

  dismissBanner: (id) =>
    set((s) => (id === undefined ? { banners: [] } : { banners: s.banners.filter((b) => b.id !== id) })),
  setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
  setDialog: (dialog) => set({ dialog }),
  setRecovery: (recovery) => set({ recovery }),
  setRecent: (recent) => set({ recent }),
  setRecentLibraries: (recentLibraries) => set({ recentLibraries }),
  rememberLibrary: (path) =>
    set((s) => ({
      recentLibraries: [path, ...s.recentLibraries.filter((p) => p !== path)].slice(0, 5),
    })),
  forgetRecent: (path) =>
    set((s) => {
      const key = pathKey(path);
      const recent = s.recent.filter((p) => pathKey(p) !== key);
      // The session only writes when something changed, so keep identity.
      return recent.length === s.recent.length ? {} : { recent };
    }),

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
  setHistory: (history) => {
    if (history === null) {
      get().closeScreen();
      return;
    }
    set({ history });
    get().openScreen("history");
  },

  setComparison: (comparison) => {
    if (comparison === null) {
      // The diff opens on top of the history screen; closing it goes back
      // there when that is where it came from, and to the document when the
      // conflict banner opened it instead.
      set((s) => ({ screen: s.history ? "history" : null, comparison: null }));
      return;
    }
    set({ comparison });
    get().openScreen("comparison");
  },

  setLibrarySort: (librarySort) => set({ librarySort }),
  toggleLibraryFilter: (tag) =>
    set((s) => ({
      libraryFilterTag: tag !== null && s.libraryFilterTag === tag ? null : tag,
      // A tag is a way into the library screen, so it opens it.
      screen: tag === null ? s.screen : "library",
    })),
  setTags: (tags) => set({ tags }),
  setBacklinks: (backlinks) => set({ backlinks }),
}));

export function activeDoc(state: AppState): Doc | null {
  return state.docs.find((d) => d.id === state.activeId) ?? null;
}
