// Everything a shortcut, a menu or a link can trigger. Saving lives in
// save.ts and closing in close.ts; the rest is here.

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { mkdir } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { flushActiveEditor } from "../editor";
import { isDirty } from "../editor/buffers";
import { emitRerender } from "../read/events";
import { render } from "../read/pipeline";
import { countWords } from "../read/words";
import { serialize } from "./eol";
import { inTauri } from "./env";
import { docFields, fsError, hashFile, readFile, writeTextAtomic } from "./fs";
import { newFile } from "../library/ops";
import { copyText, isMac } from "./platform";
import { basename, dirname, pathKey } from "./paths";
import { reloadFromDisk } from "./save";
import { toSession } from "./session";
import { serializeSettings, settingsPath } from "./settings";
import { activeDoc, makeDoc, useStore, type Doc } from "./store";
import {
  heldElsewhere,
  label,
  newWindow,
  requestQuit,
  showDocIn,
  takeOpening,
  type Holder,
} from "./windows";

/**
 * Reads each path into the open list; the first one becomes active.
 * Returns whether anything ended up open.
 *
 * A file another window already has is not opened a second time: that would
 * be two buffers, two drafts under one name and two saves racing each other
 * (W13 §5.3, M2). That window is brought forward with the file showing —
 * unless this one has something of its own to show, because asking for three
 * files and being thrown into another window over the one of them that had
 * moved would lose the other two. `surface: false` keeps the focus here
 * whatever happens (`openPathsInBackground`).
 */
export async function openPaths(
  paths: string[],
  { surface = true }: { surface?: boolean } = {},
): Promise<boolean> {
  const { activate, openDoc, showBanner } = useStore.getState();
  let opened = false;
  /** The first file that turned out to live in another window. */
  let moved: { holder: Holder; path: string } | null = null;

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
      // Asked after the read, not before it: the canonical spelling is what
      // the read comes back with, and a second round trip for every path
      // would cost more than the one wasted read this can lead to (§5.3).
      const holder = (await heldElsewhere([id])).get(id);
      if (holder) {
        moved ??= { holder: { label: holder, key: id }, path };
        continue;
      }
      const fields = docFields(info);
      openDoc(makeDoc({ id, path: info.path, ...fields }));
      // Bytes the encoding could not read are showing as `�`; saying so
      // now is what makes the question at save time make sense (spec §8).
      if (fields.decodeErrors) useStore.getState().setNote("decoded with errors");
      // A save replaces one name with a new inode; the other names keep the
      // text that is there now (review #13).
      else if (info.hardLinks > 1) {
        useStore.getState().setMessage("hard-linked — other names keep the old text");
      }
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
  if (opened) {
    useStore.getState().dismissBanner("open-failed");
    // You asked for a document; whatever screen was over it has served its
    // purpose — the rail, quick search and `recent` all come through here.
    useStore.getState().closeScreen();
  }
  if (moved) {
    // Nothing of ours to look at: go to the window that has it. Otherwise
    // stay where we are and say where the other file went.
    if (!opened && surface) await showDocIn(moved.holder);
    else useStore.getState().setMessage(`${basename(moved.path)} is open in another window`);
  }
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
    // The file is made and opened at once; the tree only asks for a name
    // afterwards, over an open document (spec §6).
    void newFile(store.libraryPath);
    return;
  }
  // Unique across runs as well as within one, and across windows as well:
  // a restored draft keeps the id it was written under, so two sessions — or
  // two windows counting from one each — must not collide on it (W13 §5.6).
  untitled += 1;
  store.openDoc(
    makeDoc({
      id: `untitled-${label()}-${Date.now().toString(36)}-${untitled}`,
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
 * Takes whatever Rust parked for this window — launch arguments, or the argv
 * of a second launch. The packet belongs to one window, so a file from Finder
 * opens once, in the window the reader was in, rather than in all of them
 * (W13 §3). Opening a file this way collapses the rail (spec §6).
 */
export async function drainPendingPaths(): Promise<void> {
  const { paths, folders } = await takeOpening();
  const first = folders[0];
  if (first) await openLibraryPath(first);
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
  store.rememberLibrary(path);
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
  // Not even to another window: a `Ctrl+click` is a note to come back to, not
  // a reason to be moved somewhere else (W13 §5.3).
  const opened = await openPaths(paths, { surface: false });
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
    await copyText(path);
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
  // The chord that opened it closes it again (spec §4).
  if (store.screen === "folderSearch") {
    store.closeScreen();
    return;
  }
  if (!store.libraryPath) {
    store.setMessage("no library — open a folder first");
    return;
  }
  store.openScreen("folderSearch");
}

/**
 * `Ctrl+,` until the settings screen lands. The file is created with the
 * defaults so there is something to edit (spec §10).
 */
export async function openSettingsFile(): Promise<void> {
  if (!inTauri) return;
  // settingsPath() knows about portable mode; appDataDir() does not, and a
  // portable instance would then edit a file it never reads (spec §10).
  const file = await settingsPath();
  try {
    await mkdir(dirname(file), { recursive: true }).catch(() => undefined);
    if ((await hashFile(file)) === null) {
      // What is in force right now, not the defaults: the settings screen
      // may already have moved things the file never got to hold.
      await writeTextAtomic(file, `${serializeSettings(useStore.getState().settings)}\n`);
    }
    // Another window may be holding settings.json; switching this one to edit
    // over whatever is on screen here would be a lie (W13 §5.3).
    if (!(await openPaths([file]))) return;
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
/**
 * What the installed app calls itself. Tauri knows, and it is the number in
 * the installer; in a browser there is no Tauri to ask, so the build baked
 * package.json's version in (vite.config.ts).
 */
async function appVersion(): Promise<string> {
  if (inTauri) {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      return await getVersion();
    } catch {
      /* fall through to the number the build knew */
    }
  }
  return __APP_VERSION__;
}

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
    title: `plain ${await appVersion()}`,
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

/**
 * `file → exit`: every window is asked the same one question its X asks, and
 * the app goes when the last of them has closed itself (W13 §8.2).
 */
export async function exitApp(): Promise<void> {
  await requestQuit();
}

/**
 * `Ctrl+Shift+N`. The new window starts on this one's library, with nothing
 * open in it: a second window on one folder is what this is for (W13 §1.2).
 */
export async function openNewWindow(): Promise<void> {
  await newWindow({ ...toSession(), files: [], active: null });
}

/**
 * `Ctrl+Shift+W`. The same way out as the X, so unsaved work is asked about
 * once (close.ts); the last window closing is the app closing (W13 §9).
 */
export async function closeWindow(): Promise<void> {
  if (!inTauri) return;
  await getCurrentWindow().close();
}

/* -------------------------------------------------- plain text (wave 5b) */

/** Chrome the reader sees but a paste should not carry. */
const DROP = ".code-bar, .h-anchor, .img-holder";

/** A blank line around them, the way a paragraph reads. */
const PARAGRAPH_TAGS = new Set([
  "p",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "section",
  "article",
  "figure",
  "table",
  "hr",
  "details",
]);

/** One line each — a list is a list, not a stack of paragraphs. */
const LINE_TAGS = new Set(["li", "ul", "ol", "dl", "dt", "dd", "figcaption", "summary"]);

/**
 * The text as it is assembled. `push` is for prose, which collapses; `raw`
 * is for separators; `keep` parks text that must survive the tidy-up.
 */
class Sink {
  text = "";
  /** `<pre>` blocks, behind a placeholder so the clean-up cannot reach them. */
  readonly kept: string[] = [];

  push(part: string): void {
    // A collapsed space right after a line break belongs to the markup.
    this.text += this.text.endsWith("\n") ? part.replace(/^[ \t]+/, "") : part;
  }

  raw(part: string): void {
    this.text += part;
  }

  keep(part: string): void {
    this.kept.push(part);
    this.text += `\u0000${this.kept.length - 1}\u0000`;
  }

  /** At least `n` line breaks here — never more than are wanted. */
  brk(n: number): void {
    if (this.text === "") return;
    this.text = this.text.replace(/[ \t]+$/, "");
    const have = /\n*$/.exec(this.text)?.[0].length ?? 0;
    this.text += "\n".repeat(Math.max(0, n - have));
  }
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function walk(node: Node, out: Sink): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      out.push((child.nodeValue ?? "").replace(/\s+/g, " "));
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;

    const el = child as Element;
    const name = el.tagName.toLowerCase();

    if (name === "img") {
      out.push(el.getAttribute("alt") ?? "");
      continue;
    }
    if (name === "br") {
      out.brk(1);
      continue;
    }
    if (name === "pre") {
      // Code keeps its indentation, its trailing spaces and its blank lines.
      // The one newline the closing fence leaves behind is not the author's,
      // and the placeholder puts it out of reach of the trim below.
      out.brk(2);
      out.keep((el.textContent ?? "").replace(/\n$/, ""));
      out.brk(2);
      continue;
    }
    if (name === "tr") {
      const cells = Array.from(el.children).filter((c) => /^(td|th)$/i.test(c.tagName));
      cells.forEach((cell, index) => {
        if (index > 0) out.raw(" | ");
        walk(cell, out);
      });
      out.brk(1);
      continue;
    }
    if (PARAGRAPH_TAGS.has(name)) {
      out.brk(2);
      walk(el, out);
      out.brk(2);
      continue;
    }
    if (LINE_TAGS.has(name)) {
      out.brk(1);
      walk(el, out);
      out.brk(1);
      continue;
    }
    walk(el, out);
  }
}

/**
 * The rendered HTML as text a mail client would accept: no `#`, no `*`, one
 * list item per line, table cells kept apart. Parsed rather than scanned — a
 * hand-rolled tokenizer trips over `title="a > b"` and entity edge cases.
 */
export function htmlToPlainText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  for (const junk of Array.from(parsed.querySelectorAll(DROP))) junk.remove();

  const out = new Sink();
  walk(parsed.body, out);

  const tidied = out.text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  // Only now do the code blocks come back, untouched by any of that.
  return tidied.replace(/\u0000(\d+)\u0000/g, (_, index: string) => out.kept[Number(index)] ?? "");
}

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
    await copyText(text);
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

/** Two frames: React has committed and the browser has laid the page out. */
function afterRender(): Promise<void> {
  return new Promise((done) => {
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  });
}

/**
 * `Ctrl+P`. Printing prints what is on screen, so the document has to be the
 * thing on screen: every full-area screen closes and the mode goes to read.
 * The mode is put back once the dialog is done with; the screens are not,
 * because printing is a deliberate detour, not a mode.
 */
export async function exportPdf(): Promise<void> {
  const store = useStore.getState();
  const doc = activeDoc(store);
  if (!doc) return;

  // Every screen takes the content area over — any of them would be what
  // got printed, so whichever is up has to go first.
  const covered = store.screen !== null;
  store.closeScreen();

  const was = doc.mode;
  if (was !== "read") {
    flushActiveEditor();
    store.setMode("read");
  }

  await afterRender();
  // The read view builds its document asynchronously; printing before it is
  // ready would print an empty page.
  if (covered || was !== "read") {
    await new Promise((done) => setTimeout(done, 400));
    await afterRender();
  }

  // `afterprint` is the tidy way back, but WKWebView's native print sheet
  // does not always fire it, so a timer backs it up (review #9).
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    window.removeEventListener("afterprint", restore);
    if (was !== "read") useStore.getState().setMode(was);
  };
  window.addEventListener("afterprint", restore);
  const backstop = setTimeout(restore, 60_000);

  try {
    if (isMac()) {
      // WKWebView answers `window.print()` with nothing at all — no dialog,
      // no error — so macOS asks the webview itself (review #9).
      await invoke("print_page");
    } else {
      window.print();
    }
  } catch {
    store.setMessage("couldn't open the print dialog");
    clearTimeout(backstop);
    restore();
  }
}

/**
 * Export the open document to one self-contained `.html` (spec §2a).
 * The build lives in read/export.ts; this is the dialog and the write.
 */
export async function exportHtmlFile(): Promise<void> {
  // Whatever was typed a moment ago belongs in the file (review #15).
  flushActiveEditor();

  const before = useStore.getState();
  const id = before.activeId;
  const opening = before.docs.find((d) => d.id === id);
  if (!opening) return;
  if (!inTauri) {
    before.setMessage("export needs the app");
    return;
  }

  const [{ save }, { exportHtml }, { dirname }] = await Promise.all([
    import("@tauri-apps/plugin-dialog"),
    import("../read/export"),
    import("./paths"),
  ]);

  const name = opening.title.replace(/\.[^.]+$/, "");
  const folder = opening.path ? dirname(opening.path) : before.libraryPath;
  const picked = await save({
    defaultPath: folder ? `${folder}/${name}.html` : `${name}.html`,
    filters: [{ name: "html", extensions: ["html"] }],
  });
  if (typeof picked !== "string") return;

  // The dialog took time; the document may have been edited or closed since.
  const store = useStore.getState();
  const current = store.docs.find((d) => d.id === id);
  if (!current) {
    store.setMessage("the document was closed");
    return;
  }

  try {
    // Read is on screen in `read` and in `split` alike, and `exportHtml`
    // checks for itself that what is drawn belongs to this document.
    const html = await exportHtml(
      current.text,
      name,
      current.path ? dirname(current.path) : null,
      { useDrawnDiagrams: current.id === store.activeId },
    );
    await invoke("write_text_atomic", { path: picked, text: html });
    useStore.getState().setMessage(`exported ${basename(picked)}`);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    useStore.getState().setMessage(`couldn't export — ${why}`);
  }
}
