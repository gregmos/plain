// Closing a document or the window. Unsaved work is never dropped without
// one explicit answer (spec §8).

import { getCurrentWindow } from "@tauri-apps/api/window";
import { dropBuffer, flushActiveEditor, isDirty } from "../editor";
import { dropDraft } from "./drafts";
import { inTauri } from "./env";
import { save } from "./save";
import { toSession, writeSession } from "./session";
import { useStore, type Doc } from "./store";

function unsaved(ids: string[]): Doc[] {
  return useStore
    .getState()
    .docs.filter((d) => ids.includes(d.id) && isDirty(d.id, d.text));
}

function forget(ids: string[]): void {
  const store = useStore.getState();
  for (const id of ids) {
    const current = store.docs.find((d) => d.id === id);
    if (current) void dropDraft(current);
    store.closeDoc(id);
    dropBuffer(id);
  }
  // There is one banner slot and it belonged to a document that is gone.
  store.dismissBanner("conflict");
  store.dismissBanner("save-failed");
}

/**
 * Closes the documents, asking once for all of them if any is unsaved.
 * `done` runs only when everything really closed — it is how the window
 * close request knows it may go through.
 */
export function closeDocs(ids: string[], done?: () => void): void {
  flushActiveEditor();
  const store = useStore.getState();
  const dirty = unsaved(ids);
  if (dirty.length === 0) {
    forget(ids);
    done?.();
    return;
  }

  store.setDialog({
    title: dirty.length === 1 ? "unsaved changes" : `${dirty.length} files have unsaved changes`,
    lines: dirty.map((d) => d.path ?? d.title),
    actions: [
      {
        label: "save",
        run: () => {
          store.setDialog(null);
          void (async () => {
            const before = new Set(useStore.getState().docs.map((d) => d.id));
            for (const item of dirty) {
              // A failed save leaves its own banner up and stops the close.
              if (!(await save(item.id))) return;
            }
            // Save As gave a nameless buffer a new id; it is still the same
            // document and it was still asked to close.
            const renamed = useStore
              .getState()
              .docs.filter((d) => !before.has(d.id))
              .map((d) => d.id);
            forget([...ids, ...renamed]);
            done?.();
          })();
        },
      },
      {
        label: "don't save",
        run: () => {
          store.setDialog(null);
          forget(ids);
          done?.();
        },
      },
      { label: "cancel", run: () => store.setDialog(null) },
    ],
    cancel: () => store.setDialog(null),
  });
}

export function closeActive(): void {
  const { activeId } = useStore.getState();
  if (activeId) closeDocs([activeId]);
}

/** The window's X and Alt+F4 go through the same one question. */
export function installCloseGuard(): () => void {
  if (!inTauri) return () => undefined;
  let leaving = false;
  const window = getCurrentWindow();
  const unlisten = window.onCloseRequested((event) => {
    if (leaving) return;
    event.preventDefault();
    const ids = useStore.getState().docs.map((d) => d.id);
    // Taken now: closing the documents is what empties the open list, and the
    // next launch is supposed to bring them back (spec §6).
    const session = toSession();
    closeDocs(ids, () => {
      leaving = true;
      void writeSession(session).then(() => window.destroy());
    });
  });
  return () => void unlisten.then((off) => off());
}
