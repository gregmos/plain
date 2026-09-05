// The Rust side of the file system (src-tauri/src/fs.rs), typed. Everything
// that reads or writes a user file goes through here — plugin-fs is only used
// for our own folder in %APPDATA%.

import { invoke } from "@tauri-apps/api/core";
import { normalizeEol, type Eol } from "./eol";
import { LARGE_TEXT, useStore, type Doc } from "./store";

export interface FileInfo {
  /** The one spelling of this file, from Rust — see `canonicalPath`. */
  path: string;
  text: string;
  encoding: string;
  bom: boolean;
  /** What the file has; `mixed` and `none` are not valid to write back. */
  eol: Eol | "mixed" | "none";
  dominantEol: Eol;
  finalNewline: boolean;
  hash: string;
  mtimeMs: number;
  size: number;
  readOnly: boolean;
  /** Bytes the encoding could not decode became replacement characters. */
  decodeErrors: boolean;
}

export interface WriteRequest {
  path: string;
  text: string;
  encoding: string;
  bom: boolean;
  eol: Eol;
  baseHash: string | null;
  allowMissing?: boolean;
  /** Keep a copy of the written bytes under this id (spec §2a). */
  snapshotId?: string;
}

export interface FsError {
  kind: "conflict" | "missing" | "io";
  message: string;
}

/** Rust rejects with the serialized error; anything else is an io failure. */
export function fsError(error: unknown): FsError {
  if (error && typeof error === "object" && "kind" in error && "message" in error) {
    return error as FsError;
  }
  return { kind: "io", message: error instanceof Error ? error.message : String(error) };
}

/** `encoding` forces one instead of detecting it (`reopen as…`, spec §8). */
export function readFile(path: string, encoding?: string): Promise<FileInfo> {
  return invoke<FileInfo>("read_file", { path, encoding: encoding ?? null });
}

export async function writeFileAtomic(request: WriteRequest): Promise<string> {
  const { hash } = await invoke<{ hash: string }>("write_file_atomic", {
    request: { allowMissing: false, ...request },
  });
  return hash;
}

/**
 * The spelling the disk itself uses: 8.3 aliases expanded, the real case, one
 * separator. Two spellings of one file must not become two documents (§8).
 * `readFile` already returns it; this is for paths that never go through it,
 * such as the name the Save As dialog gives back.
 */
export function canonicalPath(path: string): Promise<string> {
  return invoke<string>("canonical_path", { path });
}

/** null when the file is not there. */
export function hashFile(path: string): Promise<string | null> {
  return invoke<string | null>("hash_file", { path });
}

/** Our own files in %APPDATA%: same temp-and-replace, always UTF-8. */
export function writeTextAtomic(path: string, text: string): Promise<void> {
  return invoke("write_text_atomic", { path, text });
}

/** Recycle Bin, not deletion (spec §6). */
export function trashPath(path: string): Promise<void> {
  return invoke("trash_path", { path });
}

export function watchPaths(root: string | null, files: string[]): Promise<void> {
  return invoke("watch", { root, files });
}

/**
 * The document fields a freshly read file decides. Used when opening, when
 * reloading after an external change and after `reopen as…`.
 */
export function docFields(
  info: FileInfo,
): Pick<
  Doc,
  | "text"
  | "savedText"
  | "encoding"
  | "bom"
  | "eol"
  | "mixedEol"
  | "finalNewline"
  | "baseHash"
  | "readOnly"
  | "large"
  | "deleted"
  | "dirty"
  | "decodeErrors"
> {
  const text = normalizeEol(info.text);
  return {
    text,
    savedText: text,
    encoding: info.encoding,
    bom: info.bom,
    // A file with no line break yet has no style of its own (spec §8).
    eol: info.eol === "none" ? useStore.getState().settings.files.newFileEol : info.dominantEol,
    mixedEol: info.eol === "mixed",
    finalNewline: info.finalNewline,
    baseHash: info.hash,
    readOnly: info.readOnly,
    large: info.size > LARGE_TEXT,
    deleted: false,
    dirty: false,
    decodeErrors: info.decodeErrors,
  };
}
