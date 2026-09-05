// Local images ride the Tauri asset protocol, whose scope is handed out one
// folder at a time (spec §9): the folder of the open file, the library, and
// anything the reader allows from an `outside folder` placeholder.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { inTauri } from "../app/env";
import { isInside, normalizePath } from "./links";

const granted = new Set<string>();

/** Folders allowed so far this session (lowercased, forward slashes). */
export function isAllowedPath(path: string): boolean {
  if (!inTauri) return true;
  for (const dir of granted) if (isInside(path, dir)) return true;
  return false;
}

/**
 * Widens the asset protocol scope — and, on the Rust side, the file-system
 * read scope, so that links into the same folder can be opened.
 */
export async function allowAssetDir(dir: string | null): Promise<boolean> {
  if (!dir) return false;
  const path = normalizePath(dir);
  const key = path.toLowerCase();
  if (granted.has(key)) return true;
  if (!inTauri) {
    granted.add(key);
    return true;
  }
  try {
    await invoke("allow_asset_dir", { path });
    granted.add(key);
    return true;
  } catch {
    return false;
  }
}

export function assetUrl(path: string): string {
  return inTauri ? convertFileSrc(path) : path;
}
