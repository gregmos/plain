// Alt+left / Alt+right over the documents visited in this session
// (spec §5.1). Ids only — the buffers live in the store.

import { useStore } from "../app/store";

const back: string[] = [];
const forward: string[] = [];
let current: string | null = useStore.getState().activeId;
let moving = false;

useStore.subscribe((state) => {
  const id = state.activeId;
  if (id === current) return;
  if (!moving) {
    if (current) back.push(current);
    forward.length = 0;
  }
  current = id;
});

/** Pops until it finds a document that is still open. */
function step(from: string[], to: string[]): void {
  const store = useStore.getState();
  while (from.length > 0) {
    const id = from.pop();
    if (!id || !store.docs.some((doc) => doc.id === id)) continue;
    if (current) to.push(current);
    moving = true;
    store.activate(id);
    moving = false;
    return;
  }
}

export function goBack(): void {
  step(back, forward);
}

export function goForward(): void {
  step(forward, back);
}
