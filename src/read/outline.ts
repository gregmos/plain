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
