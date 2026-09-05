// Everything a shortcut, a menu or a link can trigger. Saving lives in
// save.ts and closing in close.ts; the rest is here.

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { mkdir } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { flushActiveEditor } from "../editor";
import { isDirty } from "../editor/buffers";
import { emitRerender } from "../read/events";
import { render } from "../read/pipeline";
import { countWords } from "../read/words";
import { serialize } from "./eol";
import { inTauri } from "./env";
import { docFields, fsError, hashFile, readFile, writeTextAtomic } from "./fs";
import { basename, pathKey } from "./paths";
import { reloadFromDisk } from "./save";
import { SETTINGS_FILE, serializeSettings } from "./settings";
import { activeDoc, makeDoc, useStore, type Doc } from "./store";

/**
 * Reads each path into the open list; the first one becomes active.
 * Returns whether anything ended up open.
 */
export async function openPaths(paths: string[]): Promise<boolean> {
  const { activate, openDoc, showBanner } = useStore.getState();
  let opened = false;

  for (const path of paths) {
    // The same spelling is already open: show it, and do not read the file
    // a second time.
    const known = useStore.getState().docs.find((d) => d.id === pathKey(path));
    if (known) {
      activate(known.id);
      opened = true;
      continue;
    }
    try {
      const info = await readFile(path);
      // Rust hands back the one spelling the disk uses. A short `KOTENO~1`
      // name, another case or the other separator is the same file, and one
      // file gets one buffer (spec §8).
      const id = pathKey(info.path);
      const existing = useStore.getState().docs.find((d) => d.id === id);
      if (existing) {
        activate(existing.id);
        opened = true;
        continue;
      }
      const fields = docFields(info);
      openDoc(makeDoc({ id, path: info.path, ...fields }));
      // Bytes the encoding could not read are showing as `�`; saying so
      // now is what makes the question at save time make sense (spec §8).
      if (fields.decodeErrors) useStore.getState().setNote("decoded with errors");
      opened = true;
    } catch (error) {
      const failure = fsError(error);
      // A `recent` entry that points at nothing is worth less than the row
      // it takes up, and it will fail again next time it is clicked.
      if (isGone(failure)) useStore.getState().forgetRecent(path);
      showBanner({
        id: "open-failed",
        text: `couldn't open ${basename(path)} — ${failure.message}`,
        actions: [{ label: "dismiss", run: () => useStore.getState().dismissBanner("open-failed") }],
      });
    }
  }
  // The complaint was about a file that is no longer the one on screen.
  if (opened) useStore.getState().dismissBanner("open-failed");
  return opened;
}

/**
 * The file is not there. Rust hands back the OS message, and on Windows a
 * missing file is error 2 and a missing folder on the way is error 3.
 */
function isGone(failure: { kind: string; message: string }): boolean {
  return failure.kind === "missing" || /\(os error [23]\)/.test(failure.message);
}

/**
 * `Ctrl+N`. With a library open the tree grows a row with an inline name
 * field in the root folder; without one it is a nameless buffer whose
 * `Ctrl+S` is Save As (spec §6).
 */
let untitled = 0;

export function newDoc(): void {
  const store = useStore.getState();
  if (store.libraryPath) {
    store.setRailCollapsed(false);
    store.setRailView("files");
    store.setTreeDraft({ parent: store.libraryPath, kind: "file" });
    return;
  }
  // Unique across runs as well as within one: a restored draft keeps the id
  // it was written under, and two sessions must not collide on it (spec §8).
  untitled += 1;
  store.openDoc(
    makeDoc({
      id: `untitled-${Date.now().toString(36)}-${untitled}`,
      path: null,
      text: "",
      mode: "edit",
      eol: store.settings.files.newFileEol,
    }),
  );
}

/** `F5`: build the document again, and re-read it when it is clean. */
export function refresh(): void {
  // Typing and hitting F5 with no pause in between must not read as clean:
  // the store lags the editor until its idle callback (spec §8).
  flushActiveEditor();
  const doc = activeDoc(useStore.getState());
  if (!doc?.path) {
    emitRerender();
    return;
  }
  if (isDirty(doc.id, doc.text)) {
    useStore.getState().setMessage("unsaved changes — save or reload from banner");
    emitRerender();
    return;
  }
  void reloadFromDisk(doc.id, { note: "" }).then(emitRerender);
}

/**
 * Takes whatever Rust parked for us — launch arguments, or the argv of a
 * second launch. Opening a file this way collapses the rail (spec §6).
 */
export async function pendingPaths(): Promise<string[]> {
  return inTauri ? invoke<string[]>("take_pending_paths") : [];
}

/** Folder arguments, parked separately: a folder is a library (spec §6). */
export async function pendingFolders(): Promise<string[]> {
  return inTauri ? invoke<string[]>("take_pending_folders") : [];
}

export async function drainPendingPaths(): Promise<void> {
  const folders = await pendingFolders();
  const first = folders[0];
  if (first) await openLibraryPath(first);
  const paths = await pendingPaths();
  if (paths.length === 0) return;
  // A file on its own arrives with the rail out of the way; a file that came
  // with its folder does not, because the folder is the point.
  if ((await openPaths(paths)) && !first) useStore.getState().setRailCollapsed(true);
}

export async function openFile(): Promise<void> {
  if (!inTauri) return;
  const extensions = useStore
    .getState()
    .settings.library.extensions.map((e) => e.replace(/^\./, ""));
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "markdown", extensions }],
  });
  if (typeof picked === "string") await openPaths([picked]);
}

export async function openLibrary(): Promise<void> {
  if (!inTauri) return;
  // recursive: the fs scope has to reach files in sub-folders, not just the root.
  const picked = await open({ directory: true, multiple: false, recursive: true });
  if (typeof picked !== "string") return;
  await openLibraryPath(picked);
}

/**
 * The one way a folder becomes the library: the dialog, a dropped folder, a
 * folder given as an argument and the session all come through here. The
 * tree, the watcher and the asset scope follow the store (spec §6, §9).
 */
export async function openLibraryPath(path: string, announce = true): Promise<void> {
  const store = useStore.getState();
  if (inTauri) {
    // Images and links inside the library have to be reachable (spec §9).
    await invoke("allow_asset_dir", { path }).catch(() => undefined);
  }
  store.setLibraryPath(path);
  // A folder that is opened afresh starts with everything unfolded; the
  // session puts its own set back after this (bootstrap.ts).
  if (announce) store.setCollapsed([]);
  store.setRailView("files");
  store.setRailCollapsed(false);
  if (announce) store.setMessage(`library · ${basename(path)}`);
}

export async function toggleFullscreen(): Promise<void> {
  if (!inTauri) return;
  const win = getCurrentWindow();
  await win.setFullscreen(!(await win.isFullscreen()));
}

export async function toggleAlwaysOnTop(): Promise<void> {
  const store = useStore.getState();
  const next = !store.alwaysOnTop;
  if (inTauri) await getCurrentWindow().setAlwaysOnTop(next);
  store.setAlwaysOnTop(next);
  store.setMessage(next ? "always on top" : "always on top off");
}

/**
 * Same as `openPaths`, but the document that was active stays active — this
 * is what `Ctrl+click` on a link in read does (spec §5.1).
 */
export async function openPathsInBackground(paths: string[]): Promise<boolean> {
  const before = useStore.getState().activeId;
  const opened = await openPaths(paths);
  if (before) useStore.getState().activate(before);
  return opened;
}

/* ------------------------------------------------------------- wave 5 */

/** Opens the file and lands in edit — quick search's `Ctrl+Enter` (spec §4). */
export async function openInEdit(path: string): Promise<void> {
  if (!(await openPaths([path]))) return;
  useStore.getState().setMode("edit");
}

/** `Ctrl+Shift+E`: the tree selection first, else the open document (§12). */
export async function revealInExplorer(target?: string): Promise<void> {
  const store = useStore.getState();
  const path = target ?? store.treeSelected ?? activeDoc(store)?.path;
  if (!path || !inTauri) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path).catch((error: unknown) => {
    store.setMessage(`couldn't reveal — ${fsError(error).message}`);
  });
}

/** `Ctrl+Shift+C` (spec §12). */
export async function copyPath(target?: string): Promise<void> {
  const store = useStore.getState();
  const path = target ?? activeDoc(store)?.path ?? store.treeSelected;
  if (!path) return;
  try {
    await navigator.clipboard.writeText(path);
    store.setMessage("path copied");
  } catch {
    store.setMessage("couldn't copy the path");
  }
}

/** The command palette's `quick search` and `command palette` (spec §4). */
export function openQuickSearch(seed = ""): void {
  useStore.getState().setQuickSearch({ seed });
}

/** `Ctrl+Shift+F` (spec §7). Needs a library; says so when there is none. */
export function openFolderSearch(): void {
  const store = useStore.getState();
  if (!store.libraryPath) {
    store.setMessage("no library — open a folder first");
    return;
  }
  store.setFolderSearch(true);
}

/**
 * `Ctrl+,` until the settings screen lands. The file is created with the
 * defaults so there is something to edit (spec §10).
 */
export async function openSettingsFile(): Promise<void> {
  if (!inTauri) return;
  const dir = await appDataDir();
  const file = await join(dir, SETTINGS_FILE);
  try {
    await mkdir(dir, { recursive: true }).catch(() => undefined);
    if ((await hashFile(file)) === null) {
      // What is in force right now, not the defaults: the settings screen
      // may already have moved things the file never got to hold.
      await writeTextAtomic(file, `${serializeSettings(useStore.getState().settings)}\n`);
    }
    await openPaths([file]);
    useStore.getState().setMode("edit");
  } catch (error) {
    useStore.getState().setMessage(`couldn't open settings — ${fsError(error).message}`);
  }
}

/** Whether `.md` still offers our ProgID in `open with` (spec §13). */
async function isRegistered(): Promise<boolean> {
  if (!inTauri) return false;
  return invoke<boolean>("file_association_registered").catch(() => false);
}

/**
 * `help → about` (spec §13): the version, the association and the two links.
 * A release registers itself at every start, so the entry here only has to
 * offer the way back out.
 */
export async function showAbout(): Promise<void> {
  const store = useStore.getState();
  const go = async (url: string) => {
    if (!inTauri) return;
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url).catch(() => store.setMessage("couldn't open the link"));
  };
  const toggle = async (registered: boolean) => {
    const command = registered ? "unregister_file_association" : "register_file_association";
    try {
      await invoke(command);
      store.setMessage(registered ? "unregistered" : "registered for .md");
    } catch (error) {
      store.setMessage(`couldn't change the association — ${String(error)}`);
    }
    await showAbout();
  };

  const registered = await isRegistered();
  store.setDialog({
    title: "plain 0.1.0",
    lines: [
      "a markdown reader and editor that leaves your files alone.",
      registered ? "registered for .md · .markdown" : "not registered for .md",
    ],
    actions: [
      { label: "default apps", run: () => void go("ms-settings:defaultapps") },
      { label: "github", run: () => void go("https://github.com/gregmos/plain") },
      { label: registered ? "unregister" : "register", run: () => void toggle(registered) },
      { label: "close", run: () => store.setDialog(null) },
    ],
    cancel: () => store.setDialog(null),
  });
}

/** `file → exit`: the same one question as the window's X (spec §8). */
export async function exitApp(): Promise<void> {
  if (!inTauri) return;
  await getCurrentWindow().close();
}

/* -------------------------------------------------- plain text (wave 5b) */

/** Chrome the reader sees but a paste should not carry. */
const DROP_CLASSES = ["code-bar", "h-anchor", "img-holder"];

/** A blank line around them, the way a paragraph reads. */
const PARAGRAPH_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
  "pre", "blockquote", "section", "article", "figure", "table", "hr", "details",
]);

/** One line each — a list is a list, not a stack of paragraphs. */
const LINE_TAGS = new Set([
  "li", "ul", "ol", "tr", "dl", "dt", "dd", "figcaption", "summary",
]);

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
};

function decode(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

function attribute(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? decode(m[2] ?? m[3] ?? "") : null;
}

/**
 * The rendered HTML as text a mail client would accept: no `#`, no `*`, one
 * list item per line. Done on the string rather than through a DOM, so it
 * needs no layout, no document, and runs the same in a test as in the app.
 */
export function htmlToPlainText(html: string): string {
  let out = "";
  let pre = 0;
  let i = 0;

  const push = (text: string) => {
    // A collapsed space right after a line break is the markup's, not the
    // author's — except inside `pre`, where every space is the author's.
    out += pre === 0 && out.endsWith("\n") ? text.replace(/^[ \t]+/, "") : text;
  };
  /** At least `n` line breaks here — never more than are wanted. */
  const brk = (n: number) => {
    if (out === "") return;
    out = out.replace(/[ \t]+$/, "");
    const have = /\n*$/.exec(out)?.[0].length ?? 0;
    out += "\n".repeat(Math.max(0, n - have));
  };

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      push(pre > 0 ? decode(html.slice(i)) : decode(html.slice(i)).replace(/\s+/g, " "));
      break;
    }
    if (lt > i) {
      const text = decode(html.slice(i, lt));
      push(pre > 0 ? text : text.replace(/\s+/g, " "));
    }
    const gt = html.indexOf(">", lt);
    if (gt < 0) break;

    const tag = html.slice(lt, gt + 1);
    const name = /^<\/?\s*([a-z0-9]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const closing = tag[1] === "/";

    // A comment or a doctype carries nothing.
    if (tag.startsWith("<!")) {
      i = gt + 1;
      continue;
    }

    const classes = closing ? null : attribute(tag, "class");
    if (classes && DROP_CLASSES.some((c) => classes.split(/\s+/).includes(c))) {
      i = skipElement(html, gt + 1, name);
      continue;
    }

    if (name === "img") push(attribute(tag, "alt") ?? "");
    else if (name === "br") brk(1);
    else if (name === "pre") pre += closing ? -1 : 1;

    if (PARAGRAPH_TAGS.has(name)) brk(2);
    else if (LINE_TAGS.has(name)) brk(1);
    i = gt + 1;
  }

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Position just past the matching close tag of an element already opened. */
function skipElement(html: string, from: number, name: string): number {
  let depth = 1;
  let i = from;
  const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
  tags.lastIndex = from;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    i = tags.lastIndex;
    if (depth === 0) return i;
  }
  return html.length;
}

/**
 * The document as it looks, not as it is written. Null when it is too big to
 * render at all (spec §8).
 */
export function plainTextOf(doc: Doc): string | null {
  if (doc.large) return null;
  return htmlToPlainText(render(doc.text).html);
}

/** `Ctrl+Shift+Alt+C`: the document as plain text, on the clipboard. */
export async function copyPlainText(): Promise<void> {
  const store = useStore.getState();
  flushActiveEditor();
  const doc = activeDoc(useStore.getState());
  if (!doc) return;

  const text = plainTextOf(doc);
  if (text === null) {
    store.setMessage("too large to render");
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    store.setMessage(`copied as plain text · ${countWords(text).toLocaleString("en-US")} words`);
  } catch {
    store.setMessage("couldn't copy");
  }
}

/** `file → export as text…`: the same text, written as a `.txt`. */
export async function exportPlainText(): Promise<void> {
  if (!inTauri) return;
  const store = useStore.getState();
  flushActiveEditor();
  const doc = activeDoc(useStore.getState());
  if (!doc) return;

  const text = plainTextOf(doc);
  if (text === null) {
    store.setMessage("too large to render");
    return;
  }

  const name = doc.path ? basename(doc.path) : doc.title;
  const picked = await save({
    defaultPath: `${name.replace(/\.[^.]+$/, "")}.txt`,
    filters: [{ name: "text", extensions: ["txt"] }],
  });
  if (typeof picked !== "string") return;

  try {
    // UTF-8, no BOM; the line endings new files get (spec §10).
    await writeTextAtomic(picked, serialize(text, store.settings.files.newFileEol));
    store.setMessage(`exported ${basename(picked)}`);
  } catch (error) {
    store.setMessage(`couldn't export — ${fsError(error).message}`);
  }
}

/* ------------------------------------------------------- pdf (spec §4) */

/**
 * `Ctrl+P`. Printing prints what is on screen, so the document has to be in
 * read first; the mode goes back after the dialog closes.
 */
export async function exportPdf(): Promise<void> {
  const store = useStore.getState();
  const doc = activeDoc(store);
  if (!doc) return;

  const was = doc.mode;
  if (was !== "read") {
    flushActiveEditor();
    store.setMode("read");
    // The read view builds the document on entry; printing before it is
    // ready would print an empty page.
    await new Promise((done) => setTimeout(done, 400));
  }

  const restore = () => {
    window.removeEventListener("afterprint", restore);
    if (was !== "read") useStore.getState().setMode(was);
  };
  window.addEventListener("afterprint", restore);

  try {
    window.print();
  } catch {
    store.setMessage("couldn't open the print dialog");
    restore();
  }
}
