// Which heading the reader is inside right now. Read writes it while
// scrolling, the rail highlights it (spec §4).

import { useSyncExternalStore } from "react";

let active: string | null = null;
const listeners = new Set<() => void>();

export function setActiveHeading(id: string | null): void {
  if (id === active) return;
  active = id;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): string | null {
  return active;
}

export function useActiveHeading(): string | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/* ------------------------------------------------------ reading position */

/**
 * Which heading a document should reopen at, or null for the top.
 *
 * A reader sitting above the first heading is not *at* it: reopening there
 * would scroll the meta line and the top padding off the screen, so the
 * document would not look the way it did when it was first opened. An empty
 * saved value means exactly that — the top — and so does the first heading,
 * which is where the document already starts.
 */
export function restoreTarget(
  saved: string | null,
  headings: readonly string[],
): string | null {
  if (!saved) return null;
  if (!headings.includes(saved)) return null;
  return saved === headings[0] ? null : saved;
}
