// Closing a document or the window. Unsaved work is never dropped without
// one explicit answer, and the answer has to still be true when the buffer
// is actually thrown away (spec §8).

import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { dropBuffer, flushActiveEditor, isDirty } from "../editor";
import { draftsSettled, dropDraft } from "./drafts";
import { inTauri } from "./env";
import { save } from "./save";
import { toSession, writeSession } from "./session";
import { flushSettings } from "./settings";
import { useStore, type Doc } from "./store";

/** Rust asks every window for the close scenario under this name (§8.2). */
const QUIT_REQUESTED = "plain:quit-requested";

/** Always measured on live editor text, never on a stale `Doc`. */
function unsaved(ids: string[]): Doc[] {
  flushActiveEditor();
  return useStore
    .getState()
    .docs.filter((d) => ids.includes(d.id) && isDirty(d.id, d.text));
}

/**
 * Drops the buffers and their drafts. Resolves once the drafts are really
 * gone: the window may not close while a delete is still in flight, or the
 * next start offers back work the user just discarded.
 */
async function forget(ids: string[]): Promise<void> {
  const store = useStore.getState();
  const going = ids
    .map((id) => store.docs.find((d) => d.id === id))
    .filter((d): d is Doc => d !== undefined);

  for (const id of ids) {
    store.closeDoc(id);
    dropBuffer(id);
  }
  // There is one banner slot and it belonged to a document that is gone.
  store.dismissBanner("conflict");
  store.dismissBanner("save-failed");

  await Promise.all(going.map((d) => dropDraft(d)));
  await draftsSettled();
}

interface CloseOptions {
  /** After everything is saved and agreed, before the documents go. */
  ready?: () => void;
  /** Once they are really gone and their drafts with them. */
  done?: () => void;
  /**
   * The close stopped for good: `cancel`, `Esc`, or a save that failed. Not
   * the second question after new edits — that one carries on (W13 §4.3).
   */
  cancel?: () => void;
}

/**
 * Closes the documents, asking once for all of them if any is unsaved.
 * `done` runs only when everything really closed — it is how the window
 * close request knows it may go through.
 */
export function closeDocs(ids: string[], options: CloseOptions | (() => void) = {}): void {
  // A bare callback is the common case (the tree's delete, the rail's ×).
  const hooks: CloseOptions = typeof options === "function" ? { done: options } : options;
  const finish = (targets: string[]) => {
    hooks.ready?.();
    void forget(targets).then(() => hooks.done?.());
  };

  const store = useStore.getState();
  const dirty = unsaved(ids);
  if (dirty.length === 0) {
    finish(ids);
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
              // A failed save leaves its own banner up and stops the close —
              // and the window has to be closeable again afterwards (§4.3).
              if (!(await save(item.id))) {
                hooks.cancel?.();
                return;
              }
            }
            // Save As gave a nameless buffer a new id; it is the same
            // document, so it is still one of the ones being closed.
            const renamed = useStore
              .getState()
              .docs.filter((d) => !before.has(d.id))
              .map((d) => d.id);
            const targets = [...new Set([...ids, ...renamed])];
            // The saves took time and the editor stayed usable. Nothing typed
            // in the meantime was ever agreed to, so it is asked about again
            // rather than thrown away (spec §8).
            if (unsaved(targets).length > 0) {
              closeDocs(targets, hooks);
              return;
            }
            finish(targets);
          })();
        },
      },
      {
        label: "don't save",
        run: () => {
          store.setDialog(null);
          finish(ids);
        },
      },
      {
        label: "cancel",
        run: () => {
          store.setDialog(null);
          hooks.cancel?.();
        },
      },
    ],
    // The one dialog where the last button is not the safe answer: losing
    // the work is what this asks about, so `save` is what `Enter` does.
    safe: "save",
    cancel: () => {
      store.setDialog(null);
      hooks.cancel?.();
    },
  });
}

export function closeActive(): void {
  const { activeId } = useStore.getState();
  if (activeId) closeDocs([activeId]);
}

/**
 * Everything that closes a window goes through here: its X, `Alt+F4`,
 * `Ctrl+Shift+W`, and quit — Rust holds that back and asks every window for
 * this instead, because native `terminate:` would take the unsaved text with
 * it (review #1).
 *
 * Once only, and only one at a time: a quit arriving in a window that already
 * has the question up must not put a second dialog over it or destroy the
 * window twice. The question being answered `cancel` gives the way back in
 * (W13 §4.3, M5).
 */
function leave(finish: () => Promise<void>, leaving: { busy: boolean; yes: boolean }): void {
  if (leaving.busy || leaving.yes) return;
  leaving.busy = true;
  const ids = useStore.getState().docs.map((d) => d.id);
  let session = toSession();
  closeDocs(ids, {
    // Taken after the saves — a Save As at the door belongs in the next
    // session — and before the documents go, since closing them is what
    // empties the open list (spec §6, §8).
    ready: () => {
      flushActiveEditor();
      session = toSession();
    },
    done: () => {
      leaving.yes = true;
      // `writeSession` is `main`'s alone; in any other window it is a no-op,
      // and `flushSettings` writes what that window still owes (W13 §4.3).
      void Promise.all([writeSession(session), flushSettings()]).then(finish);
    },
    cancel: () => {
      leaving.busy = false;
    },
  });
}

/** The window's X and Alt+F4 go through the same one question. */
export function installCloseGuard(): () => void {
  if (!inTauri) return () => undefined;
  const leaving = { busy: false, yes: false };
  const window = getCurrentWindow();

  const unlisten = window.onCloseRequested((event) => {
    if (leaving.yes) return;
    event.preventDefault();
    leave(async () => window.destroy(), leaving);
  });

  // `file → exit`, `⌘Q`, the Dock's Quit and anything else macOS routes to
  // `terminate:`. Rust asked every window instead of exiting; each answers
  // for its own documents and destroys itself, and the app goes when the last
  // one has (W13 §8.2).
  const unlistenQuit = listen(QUIT_REQUESTED, () => {
    leave(async () => window.destroy(), leaving);
  });

  return () => {
    void unlisten.then((off) => off());
    void unlistenQuit.then((off) => off());
  };
}
