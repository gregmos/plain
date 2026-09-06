// Search inside the library (spec §7). Rust answers a whole request at once;
// this side debounces the typing and throws away answers to questions that
// are no longer being asked.

import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../app/env";
import type { Mode } from "../app/store";

export interface LineMatch {
  /** 1-based, so it can go straight to `plain:goto-line`. */
  line: number;
  text: string;
  /** `[from, to]` pairs, in UTF-16 units. */
  ranges: [number, number][];
}

export interface FileMatches {
  path: string;
  rel: string;
  name: string;
  matches: LineMatch[];
}

export interface SearchAnswer {
  files: FileMatches[];
  skippedLarge: number;
  /** Files that refused to be read; saying nothing about them would lie. */
  skippedUnreadable: number;
  truncated: boolean;
}

export interface SearchQuery {
  root: string;
  query: string;
  caseSensitive: boolean;
  regex: boolean;
  extensions: string[];
}

export const DEBOUNCE_MS = 250;

export function searchFolder(request: SearchQuery): Promise<SearchAnswer> {
  return invoke<SearchAnswer>("search_folder", { request });
}

export interface Runner {
  /** Asks again after the debounce; the caller gets one answer or one error. */
  run: (request: SearchQuery) => void;
  /** Drops whatever is in flight — used when the screen goes away. */
  stop: () => void;
}

/**
 * One search at a time from the user's point of view: a newer question
 * cancels the older answer, which is what the counter is for (spec §7).
 */
export function runner(
  onAnswer: (answer: SearchAnswer) => void,
  onError: (message: string) => void,
): Runner {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let issued = 0;

  const stop = () => {
    clearTimeout(timer);
    issued += 1;
  };

  return {
    stop,
    run: (request) => {
      clearTimeout(timer);
      issued += 1;
      const mine = issued;
      if (request.query.trim() === "" || !inTauri) {
        onAnswer({ files: [], skippedLarge: 0, skippedUnreadable: 0, truncated: false });
        return;
      }
      timer = setTimeout(() => {
        void searchFolder(request)
          .then((answer) => {
            if (mine === issued) onAnswer(answer);
          })
          .catch((error: unknown) => {
            if (mine !== issued) return;
            onError(typeof error === "string" ? error : String(error));
          });
      }, DEBOUNCE_MS);
    },
  };
}

/* ------------------------------------------- moving around the results */

/** One line of one file, flattened so the keyboard can address it. */
export interface Hit {
  path: string;
  line: number;
}

export function hits(answer: SearchAnswer | null): Hit[] {
  if (!answer) return [];
  return answer.files.flatMap((file) =>
    file.matches.map((match) => ({ path: file.path, line: match.line })),
  );
}

/** `↑`/`↓` over the results; the ends hold rather than wrap. */
export function step(current: number, delta: number, total: number): number {
  if (total === 0) return -1;
  if (current < 0) return delta > 0 ? 0 : total - 1;
  return Math.min(total - 1, Math.max(0, current + delta));
}

/**
 * Where a result opens (spec §7). `Enter` opens it the way you are already
 * reading — read stays read — and only the editor can be sent to a line, so
 * read opens the file and says nothing about where the match was.
 * `Ctrl+Enter` always goes to edit, at the line.
 */
export interface OpenPlan {
  mode: Mode;
  jump: boolean;
}

export function openPlan(current: Mode | null, withCtrl: boolean): OpenPlan {
  if (withCtrl) return { mode: "edit", jump: true };
  const mode = current ?? "read";
  return { mode, jump: mode !== "read" };
}

/**
 * Whether the results screen should act on a key press (review #3).
 *
 * The handler used to sit on `window`, so `Enter` on the `Aa` toggle opened a
 * result instead of flipping the toggle, `Enter` on a dialog's `cancel` did
 * both, and quick search fought it for the arrows.
 */
export interface KeyContext {
  /** Something else has already dealt with it. */
  defaultPrevented: boolean;
  /** The key went to a control that has its own answer for `Enter`. */
  onControl: boolean;
  /** A dialog or the quick-search modal is on top and owns the keyboard. */
  blocked: boolean;
}

export function handlesKey(key: string, context: KeyContext): boolean {
  if (context.defaultPrevented || context.blocked) return false;
  // Arrows still walk the list from anywhere on the screen; `Enter` belongs
  // to whichever button the focus is on.
  if (key === "Enter") return !context.onControl;
  return key === "ArrowDown" || key === "ArrowUp";
}
