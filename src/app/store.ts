// The whole app state. `text` is already on the document so waves 2 and 3
// can fill it in without reshaping anything.

import { create } from "zustand";
import { DEFAULTS, type Settings, type Theme } from "./settings";
import { applyAppearance, applyTheme, resolveTheme } from "./theme";
import { basename, pathKey } from "./paths";

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
  text: string;
  dirty: boolean;
  mode: Mode;
  readOnly: boolean;
  /** Filled by the read pipeline; drives the outline (wave 2). */
  headings: Heading[];
  /** 1-based caret position from the editor (wave 3); null in read. */
  caret: { line: number; col: number } | null;
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
  banner: Banner | null;
  alwaysOnTop: boolean;

  applySettings: (settings: Settings) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  syncSystemTheme: (resolved: "light" | "dark") => void;
  toggleRail: () => void;
  setRailCollapsed: (collapsed: boolean) => void;
  setRailView: (view: RailView) => void;
  setLibraryPath: (path: string | null) => void;
  openDoc: (path: string, text: string) => void;
  /** Generic per-document patch — the way read/edit waves update a doc. */
  updateDoc: (id: string, patch: Partial<Omit<Doc, "id">>) => void;
  activate: (id: string) => void;
  closeDoc: (id: string) => void;
  cycleDoc: (step: number) => void;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
  setMessage: (message: string | null) => void;
  showBanner: (banner: Banner) => void;
  dismissBanner: (id?: string) => void;
  setAlwaysOnTop: (on: boolean) => void;
}

let messageTimer: ReturnType<typeof setTimeout> | undefined;

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
  banner: null,
  alwaysOnTop: false,

  applySettings: (settings) => {
    applyTheme(settings.appearance.theme);
    applyAppearance(settings.appearance);
    set({
      settings,
      theme: settings.appearance.theme,
      resolvedTheme: resolveTheme(settings.appearance.theme),
    });
  },

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme, resolvedTheme: resolveTheme(theme) });
  },

  toggleTheme: () => {
    const next = get().resolvedTheme === "dark" ? "light" : "dark";
    applyTheme(next);
    set({ theme: next, resolvedTheme: next });
  },

  syncSystemTheme: (resolved) => {
    if (get().theme === "system") set({ resolvedTheme: resolved });
  },

  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  setRailCollapsed: (railCollapsed) => set({ railCollapsed }),
  setRailView: (railView) => set({ railView }),
  setLibraryPath: (libraryPath) => set({ libraryPath }),

  openDoc: (path, text) => {
    const id = pathKey(path);
    const existing = get().docs.find((d) => d.id === id);
    if (existing) {
      set({ activeId: existing.id });
      return;
    }
    const doc: Doc = {
      id,
      path,
      title: basename(path),
      text,
      dirty: false,
      mode: "read",
      readOnly: false,
      headings: [],
      caret: null,
    };
    set((s) => ({
      docs: [...s.docs, doc],
      activeId: doc.id,
      recent: [path, ...s.recent.filter((p) => p !== path)].slice(0, 20),
    }));
  },

  updateDoc: (id, patch) =>
    set((s) => ({ docs: s.docs.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),

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

  showBanner: (banner) => set({ banner }),
  dismissBanner: (id) => set((s) => (id && s.banner?.id !== id ? {} : { banner: null })),
  setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
}));

export function activeDoc(state: AppState): Doc | null {
  return state.docs.find((d) => d.id === state.activeId) ?? null;
}
