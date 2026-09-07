// More than one window, from the front end's side (src-tauri/src/windows.rs
// holds the other one).
//
// A window is its own webview with its own store, so two windows share
// almost nothing and neither has to know what the other is showing. The
// exceptions are all here: which window a file belongs to, what a window was
// asked to open as it started, and the settings, which are one file and have
// to read the same in every window.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./env";
import { normalizeSettings, SETTINGS_CHANGED, type Settings } from "./settings";
import { useStore } from "./store";
import type { SessionFile } from "./session";

/** Told to the window that already has a file open (windows.rs). */
const ACTIVATE_DOC = "plain:activate-doc";

/**
 * This window's label. `main` is the one tauri.conf.json builds; the rest are
 * `w2`, `w3`… A browser has no windows to tell apart, so it is always the
 * first one there.
 */
export function label(): string {
  return inTauri ? getCurrentWindow().label : "main";
}

/** The window a run starts with, and the only one that restores the others. */
export function isFirstWindow(): boolean {
  return label() === "main";
}

/** What this window was handed at birth (windows.rs). Drained once. */
export interface Opening {
  paths: string[];
  folders: string[];
  session: SessionFile | null;
}

export async function takeOpening(): Promise<Opening> {
  if (!inTauri) return { paths: [], folders: [], session: null };
  try {
    return await invoke<Opening>("take_opening");
  } catch {
    return { paths: [], folders: [], session: null };
  }
}

/**
 * A window coming back from state.json: it keeps the place and the size it
 * had, because the window-state plugin knows them under its label.
 */
export async function restoreWindow(session: SessionFile): Promise<void> {
  await open(session, [], true);
}

/**
 * `file → new window`. It starts on the same library — a second window on
 * one folder is what this is usually for — with nothing open in it, and sits
 * down and to the right of this one rather than exactly on top.
 */
export async function newWindow(session: SessionFile | null = null): Promise<void> {
  await open(session, [], false);
}

async function open(
  session: SessionFile | null,
  paths: string[],
  restoring: boolean,
): Promise<void> {
  if (!inTauri) return;
  try {
    await invoke("new_window", { session, paths, restoring });
  } catch (error) {
    useStore.getState().setMessage(`couldn't open a window — ${String(error)}`);
  }
}

/** `⌘Q`, `file → exit`: every window is asked, and the last one out ends it. */
export async function requestQuit(): Promise<void> {
  if (!inTauri) return;
  await invoke("request_quit").catch(() => undefined);
}

/* ------------------------------------------------- one file, one window */

export interface Holder {
  label: string;
  key: string;
}

/**
 * Which of these files another window already has open. Two windows with one
 * file would be two buffers, two drafts under the same name and two saves
 * racing each other, so the file is never opened twice (spec §8).
 */
export async function heldElsewhere(keys: string[]): Promise<Map<string, string>> {
  if (!inTauri || keys.length === 0) return new Map();
  try {
    const held = await invoke<Holder[]>("holding_window", { keys });
    return new Map(held.map((one) => [one.key, one.label]));
  } catch {
    return new Map();
  }
}

/** Brings that window forward with that document showing. */
export async function showDocIn(holder: Holder): Promise<void> {
  if (!inTauri) return;
  await invoke("show_doc_in", { label: holder.label, key: holder.key }).catch(() => undefined);
}

/** What this window has open, so the other windows can be told. */
export async function registerOpenDocs(keys: string[]): Promise<void> {
  if (!inTauri) return;
  await invoke("set_open_docs", { keys }).catch(() => undefined);
}

/**
 * Keeps that list up to date. Only the documents with a file: a buffer that
 * has never been written to disk is nobody else's to find.
 */
export function installDocRegistry(): () => void {
  if (!inTauri) return () => undefined;
  const report = () => {
    const keys = useStore
      .getState()
      .docs.filter((doc) => doc.path !== null)
      .map((doc) => doc.id);
    void registerOpenDocs(keys);
  };
  report();
  return useStore.subscribe((state, previous) => {
    if (state.docs !== previous.docs) report();
  });
}

/**
 * Another window asked us to show a document we already have. It is always
 * one of ours: the asking window looked us up by it.
 */
export function installActivateDoc(): () => void {
  if (!inTauri) return () => undefined;
  const unlisten = listen<string>(ACTIVATE_DOC, (event) => {
    const store = useStore.getState();
    if (store.docs.some((doc) => doc.id === event.payload)) store.activate(event.payload);
  });
  return () => void unlisten.then((off) => off());
}

/* --------------------------------------------------------------- settings */

/**
 * settings.json is one file for the whole app, so a theme changed in one
 * window changes in all of them at once. Without this the other windows keep
 * showing the old value and, worse, write it back over the new one on the
 * way out (spec §10).
 */
export function installSettingsSync(): () => void {
  if (!inTauri) return () => undefined;
  const mine = label();
  const unlisten = listen<{ from: string; settings: Settings }>(SETTINGS_CHANGED, (event) => {
    if (event.payload.from === mine) return;
    // Applied, not saved: the window that changed them has already written
    // the file, and writing it again from here would be a loop.
    useStore.getState().applySettings(normalizeSettings(event.payload.settings));
  });
  return () => void unlisten.then((off) => off());
}
