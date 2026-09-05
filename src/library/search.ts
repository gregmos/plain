// Search inside the library (spec §7). Rust answers a whole request at once;
// this side debounces the typing and throws away answers to questions that
// are no longer being asked.

import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "../app/env";

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
