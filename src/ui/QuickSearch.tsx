// Quick search (mockup 1f, spec §4): 520px, 120px from the top, the app
// faded out behind it. An empty field shows what you read last; typing
// searches the library by path; a leading `>` searches the commands.

import { useEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import { openInEdit, openLibraryPath, openPaths } from "../app/commands";
import { basename, dirname } from "../app/paths";
import { availableCommands, type Command as AppCommand } from "../app/registry";
import { useStore } from "../app/store";
import { pieces, rank } from "../library/fuzzy";
import { files } from "../library/tree";
import "./library.css";

const RECENT = 8;

interface Entry {
  key: string;
  /** What is shown on the left, already split into matched pieces. */
  label: { text: string; hit: boolean }[];
  /** The folder, or the chord for a command. */
  where: string;
  run: (inEdit: boolean) => void;
}

function plain(text: string): { text: string; hit: boolean }[] {
  return [{ text, hit: false }];
}

/** `notes/ideas.md` -> `notes`; a file in the root has no folder to show. */
function folderOf(rel: string): string {
  const at = rel.lastIndexOf("/");
  return at < 0 ? "" : rel.slice(0, at);
}

function commandEntries(query: string, close: () => void): Entry[] {
  const needle = query.trim().toLowerCase();
  return availableCommands()
    .filter((command) => command.title.toLowerCase().includes(needle))
    .map((command: AppCommand) => ({
      key: `action:${command.id}`,
      label: plain(command.title),
      where: (command.chord ?? command.hint ?? "").toLowerCase(),
      run: () => {
        close();
        void command.run();
      },
    }));
}

export function QuickSearch() {
  const open = useStore((s) => s.quickSearch);
  const tree = useStore((s) => s.tree);
  const recent = useStore((s) => s.recent);
  const recentLibraries = useStore((s) => s.recentLibraries);
  const libraryPath = useStore((s) => s.libraryPath);

  const [query, setQuery] = useState("");
  const modal = useRef<HTMLDivElement>(null);
  // cmdk calls `onSelect` without the event, so the modifier is read here.
  const withCtrl = useRef(false);

  useEffect(() => {
    setQuery(open?.seed ?? "");
  }, [open]);

  const close = () => useStore.getState().setQuickSearch(null);

  const paths = useMemo(() => files(tree), [tree]);

  const sections = useMemo(() => {
    if (!open) return [];
    if (query.startsWith(">")) {
      return [{ title: "actions", entries: commandEntries(query.slice(1), close) }];
    }
    if (query.trim() === "") {
      const entries: Entry[] = recent.slice(0, RECENT).map((path) => ({
        key: `recent:${path}`,
        label: plain(basename(path)),
        where: dirname(path),
        run: (inEdit) => {
          close();
          void (inEdit ? openInEdit(path) : openPaths([path]));
        },
      }));
      // The folders you were last in, under the files you were last in.
      const libraries: Entry[] = recentLibraries.slice(0, 3).map((path) => ({
        key: `library:${path}`,
        label: plain(basename(path)),
        where: dirname(path),
        run: () => {
          close();
          void openLibraryPath(path);
        },
      }));
      return libraries.length > 0
        ? [
            { title: "recent", entries },
            { title: "libraries", entries: libraries },
          ]
        : [{ title: "recent", entries }];
    }

    const haystack = paths.map((node) => node.rel);
    const entries: Entry[] = rank(haystack, query).map((hit) => {
      const node = paths[hit.index];
      const rel = haystack[hit.index] ?? "";
      return {
        key: `file:${rel}`,
        label: pieces(rel, hit.ranges),
        where: folderOf(rel),
        run: (inEdit) => {
          close();
          if (!node) return;
          void (inEdit ? openInEdit(node.path) : openPaths([node.path]));
        },
      };
    });
    // Without a library there is nothing to search but the commands (§4).
    if (!libraryPath) {
      return [{ title: "actions", entries: commandEntries(query, close) }];
    }
    return [{ title: "files", entries }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, paths, recent, recentLibraries, libraryPath]);

  // A click anywhere else is a way out, like `Esc`.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!modal.current?.contains(event.target as Node)) close();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!open) return null;

  const empty = sections.every((section) => section.entries.length === 0);

  return (
    <Command
      className="qs"
      ref={modal}
      label="quick search"
      shouldFilter={false}
      loop
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
          return;
        }
        if (event.key === "Enter") withCtrl.current = event.ctrlKey;
      }}
    >
      <div className="qs-field">
        <span className="qs-glyph">⌕</span>
        <Command.Input
          className="qs-input"
          value={query}
          onValueChange={setQuery}
          placeholder="search files, or > for commands"
          autoFocus
        />
        <span className="qs-esc">esc</span>
      </div>

      <Command.List className="qs-list">
        {empty && <Command.Empty className="qs-empty">nothing found</Command.Empty>}
        {sections.map((section) =>
          section.entries.length === 0 ? null : (
            <Command.Group
              key={section.title}
              heading={<span className="qs-section">{section.title}</span>}
            >
              {section.entries.map((entry) => (
                <Command.Item
                  key={entry.key}
                  value={entry.key}
                  className="qs-item"
                  onSelect={() => {
                    const inEdit = withCtrl.current;
                    withCtrl.current = false;
                    entry.run(inEdit);
                  }}
                >
                  <span className="qs-label">
                    {entry.label.map((piece, at) => (
                      <span key={at} className={piece.hit ? "qs-hit" : undefined}>
                        {piece.text}
                      </span>
                    ))}
                  </span>
                  {entry.where && <span className="qs-where">{entry.where}</span>}
                </Command.Item>
              ))}
            </Command.Group>
          ),
        )}
      </Command.List>

      <div className="qs-footer">
        <span>↑↓ move</span>
        <span>↵ open</span>
        <span>ctrl ↵ open in edit</span>
      </div>
    </Command>
  );
}
