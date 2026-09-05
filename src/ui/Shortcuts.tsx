// The key list (spec §12), `F1` and `help → shortcuts`. It used to live in
// the README; it belongs where the keys are. Everything with a chord comes
// out of the command registry, so this page cannot drift from the bindings.

import { Fragment, useEffect } from "react";
import { chordText } from "../app/chords";
import { commands } from "../app/registry";
import { useStore } from "../app/store";
import "./dialogs.css";
import "./settings.css";

type Group =
  | "files"
  | "navigation"
  | "view"
  | "formatting"
  | "editing"
  | "tree"
  | "other";

const ORDER: Group[] = [
  "files",
  "navigation",
  "view",
  "formatting",
  "editing",
  "tree",
  "other",
];

/** Command id prefix -> the group it is listed under. */
const BY_PREFIX: { prefix: string; group: Group }[] = [
  { prefix: "file.", group: "files" },
  { prefix: "nav.", group: "navigation" },
  { prefix: "view.", group: "view" },
  { prefix: "edit.", group: "formatting" },
  { prefix: "app.", group: "other" },
];

/** Undo and redo are `edit.` ids but they are not formatting. */
const MOVED: Record<string, Group> = { "edit.undo": "editing", "edit.redo": "editing" };

/** `Ctrl+1…6` is one line in the spec; six rows would only be noise. */
const HEADINGS = "edit.heading1";
const SKIP = new Set(["edit.heading2", "edit.heading3", "edit.heading4", "edit.heading5", "edit.heading6"]);

interface Row {
  key: string;
  label: string;
  keys: string;
}

/**
 * Bindings that belong to CodeMirror's own keymap (@codemirror/commands and
 * @codemirror/search), not to our registry — they are standard CM6 and are
 * listed here by hand so the page is the whole truth (spec §5.2).
 */
const STANDARD: Record<string, Row[]> = {
  editing: [
    { key: "cm-multi", label: "select next occurrence", keys: "ctrl d" },
    { key: "cm-cursor", label: "add cursor above / below", keys: "ctrl alt ↑ ↓" },
    { key: "cm-move", label: "move line", keys: "alt ↑ ↓" },
    { key: "cm-dup", label: "duplicate line", keys: "alt shift ↑ ↓" },
    { key: "cm-del", label: "delete line", keys: "ctrl shift x" },
    { key: "cm-fold", label: "fold / unfold", keys: "ctrl shift [ ]" },
    { key: "cm-plain", label: "paste as plain text", keys: "ctrl shift v" },
    { key: "cm-tab", label: "indent / outdent list item", keys: "tab · shift tab" },
  ],
  tree: [
    { key: "tree-open", label: "open", keys: "enter" },
    { key: "tree-move", label: "move", keys: "↑ ↓" },
    { key: "tree-rename", label: "rename", keys: "f2" },
    { key: "tree-delete", label: "delete to recycle bin", keys: "delete" },
  ],
};

function groupOf(id: string): Group {
  const moved = MOVED[id];
  if (moved) return moved;
  return BY_PREFIX.find((entry) => id.startsWith(entry.prefix))?.group ?? "other";
}

function rows(): Record<Group, Row[]> {
  const out = Object.fromEntries(ORDER.map((g) => [g, [] as Row[]])) as Record<Group, Row[]>;

  for (const command of commands) {
    // `hint` is a chord the editor's keymap or WebView2 owns; it is still a
    // key the reader can press, so it belongs on this page.
    // A command can answer to more than one chord (`F8` is taken by a global
    // hotkey on some machines), and every one of them belongs on this page.
    const all = [command.chord ?? command.hint, ...(command.chords ?? [])].filter(
      (chord): chord is string => Boolean(chord),
    );
    if (all.length === 0 || SKIP.has(command.id)) continue;
    const heading = command.id === HEADINGS;
    out[groupOf(command.id)].push({
      key: command.id,
      label: heading ? "heading 1–6" : command.title,
      keys: heading ? "ctrl 1 … ctrl 6" : all.map(chordText).join(" · "),
    });
  }

  for (const [group, list] of Object.entries(STANDARD)) {
    out[group as Group].push(...list);
  }
  return out;
}

export function ShortcutsScreen() {
  const close = () => useStore.getState().setShortcutsOpen(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (useStore.getState().dialog) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  const grouped = rows();

  return (
    <div className="screen">
      <div className="screen-column settings-column">
        <div className="settings-head">
          <h1 className="screen-title">shortcuts</h1>
          <button className="link" onClick={close}>
            close
          </button>
        </div>

        {ORDER.map((group) => {
          const list = grouped[group];
          if (list.length === 0) return null;
          return (
            <Fragment key={group}>
              <div className="keys-group section-title">{group}</div>
              {list.map((row) => (
                <div className="keys-row" key={row.key}>
                  <span className="keys-what">{row.label}</span>
                  <span className="keys-chord">{row.keys}</span>
                </div>
              ))}
            </Fragment>
          );
        })}

        <div className="keys-note">shortcuts work in any keyboard layout</div>
      </div>
    </div>
  );
}
