// Images into the document (spec §2a): pasted from the clipboard or dropped
// on the editor, they land in `assets/` next to the file and the caret gets
// `![](assets/<name>)`. Nothing is rewritten, resized or renamed afterwards.

import { open } from "@tauri-apps/plugin-dialog";
import { copyFile, exists, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import type { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { dirname } from "../app/paths";
import { inTauri } from "../app/env";
import { useStore, type Doc } from "../app/store";
import { allowAssetDir } from "../read/assets";
import { syncTarget } from "./sync";
import { liveEditor } from "./EditView";

const FOLDER = "assets";

export const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".avif",
];

export function isImagePath(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

/** `2026-09-05-184233.png` — sortable, and unique unless you paste twice a second. */
export function stampName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.png`
  );
}

/** `name.png`, `name-2.png`, `name-3.png` — the first one nothing else has. */
export function uniqueName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${stem}-${n}${extension}`;
    if (!taken(candidate)) return candidate;
  }
  return `${stem}-${Date.now()}${extension}`;
}

/** The characters that would end a markdown link early (review #8). */
const LINK_ESCAPES: Record<string, string> = {
  " ": "%20",
  "(": "%28",
  ")": "%29",
  "<": "%3C",
  ">": "%3E",
  '"': "%22",
  "'": "%27",
  "`": "%60",
  "\\": "%5C",
};

/**
 * What goes into the document. Posix separator: it is a markdown path, and
 * only what would break the link is escaped — the file on disk keeps its own
 * name, and a Cyrillic one stays readable in the source (review #8).
 */
export function imageMarkdown(name: string): string {
  const safe = name.replace(/[ ()<>"'`\\]/g, (ch) => LINK_ESCAPES[ch] ?? ch);
  return `![](${FOLDER}/${safe})`;
}

/** Windows paths, since that is what the file system hands us (spec §13). */
function childPath(dir: string, name: string): string {
  return dir.endsWith("\\") || dir.endsWith("/") ? dir + name : `${dir}\\${name}`;
}

/**
 * The `assets/` folder beside the document, made if it wasn't there, and put
 * in the asset and file-system scopes so the image can be written and then
 * shown (spec §9).
 */
async function assetsFolder(doc: Doc): Promise<string | null> {
  if (!doc.path) return null;
  const dir = dirname(doc.path);
  await allowAssetDir(dir);
  const folder = childPath(dir, FOLDER);
  if (!(await exists(folder))) await mkdir(folder);
  await allowAssetDir(folder);
  return folder;
}

/**
 * Two pastes in the same second would pick the same free name, so the whole
 * name-then-write runs one after another (review #7).
 */
let queue: Promise<unknown> = Promise.resolve();

export function queueAssetWork<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function freeName(folder: string, wanted: string): Promise<string> {
  const seen = new Set<string>();
  let name = wanted;
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (!(await exists(childPath(folder, name)))) return name;
    seen.add(name);
    name = uniqueName(wanted, (candidate) => seen.has(candidate));
  }
  return name;
}

/**
 * The write took a moment, and in that moment the editor may have moved to
 * another document — or left the screen. The link belongs to the document it
 * was pasted into and nowhere else (review #3).
 */
export function landing(target: string | null, id: string): "insert" | "message" {
  return target === id ? "insert" : "message";
}

function place(view: EditorView, doc: Doc, name: string): void {
  if (landing(syncTarget(), doc.id) === "insert") insert(view, name);
  else useStore.getState().setMessage(`image saved to ${FOLDER}/${name}`);
}

function insert(view: EditorView, name: string): void {
  const text = imageMarkdown(name);
  const range = view.state.selection.main;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: EditorSelection.cursor(range.from + text.length),
    userEvent: "input.paste",
    scrollIntoView: true,
  });
}

function needsFile(): void {
  useStore.getState().setMessage("save the file first");
}

/** Clipboard image -> `assets/<timestamp>.png` (spec §2a). */
export async function pasteImage(view: EditorView, doc: Doc, file: File): Promise<boolean> {
  if (view.state.readOnly) return false;
  if (!doc.path) {
    needsFile();
    return false;
  }
  if (!inTauri) return false;
  try {
    const folder = await assetsFolder(doc);
    if (!folder) return false;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = await queueAssetWork(async () => {
      const free = await freeName(folder, stampName(new Date()));
      await writeFile(childPath(folder, free), bytes);
      return free;
    });
    place(view, doc, name);
    return true;
  } catch (error) {
    useStore.getState().setMessage(`couldn't save the image — ${reason(error)}`);
    return false;
  }
}

/**
 * `Ctrl+Alt+I` and `edit → insert → image…`: pick a file, copy it in, link
 * it (spec §5.2, v2.6). The dropping path does the work.
 */
export async function insertImageFromFile(): Promise<boolean> {
  const state = useStore.getState();
  const doc = state.docs.find((d) => d.id === state.activeId);
  const view = liveEditor();
  // Nothing to write into: no editor, no file, or a read-only one. Asking
  // for a picture first and refusing afterwards would be rude (review #12).
  if (!doc || !view || view.state.readOnly) return false;
  if (!doc.path) {
    needsFile();
    return false;
  }
  if (!inTauri) return false;

  let picked: string | string[] | null = null;
  try {
    picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "image", extensions: IMAGE_EXTENSIONS.map((e) => e.slice(1)) }],
    });
  } catch (error) {
    useStore.getState().setMessage(`couldn't open the picker — ${reason(error)}`);
    return false;
  }
  if (typeof picked !== "string") return false;

  // The dialog took its time; the editor may be showing something else now.
  const target = liveEditor();
  if (!target || syncTarget() !== doc.id) return false;
  return dropImages(target, doc, [picked]);
}

/** Dropped image files -> `assets/<their own name>` (spec §2a). */
export async function dropImages(view: EditorView, doc: Doc, paths: string[]): Promise<boolean> {
  if (view.state.readOnly || paths.length === 0) return false;
  if (!doc.path) {
    needsFile();
    return false;
  }
  if (!inTauri) return false;
  try {
    const folder = await assetsFolder(doc);
    if (!folder) return false;
    for (const path of paths) {
      const wanted = path.split(/[\\/]/).pop() ?? "image.png";
      const name = await queueAssetWork(async () => {
        const free = await freeName(folder, wanted);
        await copyFile(path, childPath(folder, free));
        return free;
      });
      place(view, doc, name);
    }
    return true;
  } catch (error) {
    useStore.getState().setMessage(`couldn't copy the image — ${reason(error)}`);
    return false;
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
