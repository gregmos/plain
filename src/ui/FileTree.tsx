// The `files` section of the rail (mockup 1a): folders as folding uppercase
// headings, files under them, the open one on `--surface` with a `●` when it
// has unsaved edits. Plain DOM, no virtualisation (spec §4).

import { useEffect, useMemo, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { openLibrary, openPaths, revealInExplorer } from "../app/commands";
import { pathKey } from "../app/paths";
import { useStore, type TreeNode } from "../app/store";
import { askDelete, createFile, createFolder, renameEntry, suggestedName } from "../library/ops";
import { flatten, type Row } from "../library/tree";
import "./library.css";

/** A row is either something on disk or the inline field making a new one. */
type Line = (Row & { draft?: false }) | { draft: true; depth: number };

function indent(depth: number): { paddingLeft: string } {
  return { paddingLeft: `calc(var(--rail-pad-x) + ${depth * 12}px)` };
}

/** The inline field for `new file`, `new folder` and `rename`. */
function NameField({
  initial,
  depth,
  onDone,
  onCancel,
}: {
  initial: string;
  depth: number;
  onDone: (name: string) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const field = input.current;
    if (!field) return;
    field.focus();
    // The extension is rarely what you want to retype.
    const dot = initial.lastIndexOf(".");
    field.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  return (
    <div className="tree-row" style={indent(depth)}>
      <input
        ref={input}
        className="tree-input"
        value={value}
        spellCheck={false}
        onChange={(event) => setValue(event.target.value)}
        onBlur={onCancel}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onDone(value);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onCancel();
          }
        }}
      />
    </div>
  );
}

function Menu({ children }: { children: React.ReactNode }) {
  return (
    <ContextMenu.Portal>
      <ContextMenu.Content className="menu" collisionPadding={8}>
        {children}
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );
}

export function FileTree() {
  const tree = useStore((s) => s.tree);
  const collapsed = useStore((s) => s.collapsed);
  const libraryPath = useStore((s) => s.libraryPath);
  const docs = useStore((s) => s.docs);
  const activeId = useStore((s) => s.activeId);
  const selected = useStore((s) => s.treeSelected);
  const draft = useStore((s) => s.treeDraft);
  const renaming = useStore((s) => s.treeRenaming);

  const container = useRef<HTMLDivElement>(null);
  const shut = useMemo(() => new Set(collapsed), [collapsed]);
  const rows = useMemo(() => flatten(tree, shut), [tree, shut]);

  /** Where the inline `new …` field goes: under its folder, or at the top. */
  const lines: Line[] = useMemo(() => {
    const out: Line[] = rows.map((row) => ({ ...row, draft: false as const }));
    if (!draft) return out;
    if (libraryPath && pathKey(draft.parent) === pathKey(libraryPath)) {
      out.unshift({ draft: true, depth: 0 });
      return out;
    }
    const at = out.findIndex((line) => !line.draft && line.node.path === draft.parent);
    if (at < 0) return out;
    const parent = out[at] as Row;
    out.splice(at + 1, 0, { draft: true, depth: parent.depth + 1 });
    return out;
  }, [rows, draft, libraryPath]);

  // Worked out once, when the draft starts; retyping should not re-suggest.
  const draftName = useMemo(
    () => (draft ? suggestedName(draft.parent, draft.kind) : ""),
    [draft],
  );

  // A file that stops existing must not stay selected.
  useEffect(() => {
    if (selected && !rows.some((row) => row.node.path === selected)) {
      useStore.getState().setTreeSelected(null);
    }
  }, [rows, selected]);

  const openOf = (path: string) => docs.find((doc) => doc.path && pathKey(doc.path) === pathKey(path));

  const startDraft = (parent: string, kind: "file" | "folder") => {
    const store = useStore.getState();
    // A folder you are adding to has to be open to show the field.
    const node = rows.find((row) => row.node.path === parent);
    if (node && store.collapsed.includes(node.node.rel)) store.toggleCollapsed(node.node.rel);
    store.setTreeRenaming(null);
    store.setTreeDraft({ parent, kind });
  };

  const activate = (node: TreeNode) => {
    const store = useStore.getState();
    store.setTreeSelected(node.path);
    if (node.dir) store.toggleCollapsed(node.rel);
    else void openPaths([node.path]);
  };

  /** ↑/↓ move, `Enter` opens, `F2` renames, `Delete` asks (spec §12). */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (draft || renaming) return;
    const index = rows.findIndex((row) => row.node.path === selected);
    const step = (delta: number) => {
      event.preventDefault();
      const next = rows[Math.min(rows.length - 1, Math.max(0, index + delta))];
      if (!next) return;
      useStore.getState().setTreeSelected(next.node.path);
      // Moving the focus too is what draws the accent outline (spec §3).
      const row = container.current?.querySelector<HTMLElement>(
        `[data-path="${CSS.escape(next.node.path)}"]`,
      );
      row?.focus();
    };
    if (event.key === "ArrowDown") return step(index < 0 ? 0 : 1);
    if (event.key === "ArrowUp") return step(index < 0 ? 0 : -1);

    const row = rows[index];
    if (!row) return;
    if (event.key === "Enter") {
      event.preventDefault();
      activate(row.node);
    } else if (event.key === "F2") {
      event.preventDefault();
      useStore.getState().setTreeRenaming(row.node.path);
    } else if (event.key === "Delete") {
      event.preventDefault();
      askDelete(row.node);
    }
  };

  if (!libraryPath) {
    return (
      <button className="tree-empty link" onClick={() => void openLibrary()}>
        open a library
      </button>
    );
  }

  const rootMenu = (
    <Menu>
      <ContextMenu.Item className="menu-item" onSelect={() => startDraft(libraryPath, "file")}>
        new file
      </ContextMenu.Item>
      <ContextMenu.Item className="menu-item" onSelect={() => startDraft(libraryPath, "folder")}>
        new folder
      </ContextMenu.Item>
      <ContextMenu.Item className="menu-item" onSelect={() => void revealInExplorer(libraryPath)}>
        reveal in explorer
      </ContextMenu.Item>
    </Menu>
  );

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="tree" ref={container} tabIndex={0} onKeyDown={onKeyDown}>
          {lines.length === 0 && <div className="tree-empty">no markdown files</div>}

          {lines.map((line, at) => {
            if (line.draft) {
              const kind = draft?.kind ?? "file";
              const parent = draft?.parent ?? libraryPath;
              return (
                <NameField
                  key={`draft-${at}`}
                  depth={line.depth}
                  initial={draftName}
                  onCancel={() => useStore.getState().setTreeDraft(null)}
                  onDone={(name) => {
                    useStore.getState().setTreeDraft(null);
                    void (kind === "file" ? createFile(parent, name) : createFolder(parent, name));
                  }}
                />
              );
            }

            const { node, depth, collapsed: folded } = line;
            if (renaming === node.path) {
              return (
                <NameField
                  key={node.path}
                  depth={depth}
                  initial={node.name}
                  onCancel={() => useStore.getState().setTreeRenaming(null)}
                  onDone={(name) => {
                    useStore.getState().setTreeRenaming(null);
                    void renameEntry(node.path, name);
                  }}
                />
              );
            }

            const doc = node.dir ? undefined : openOf(node.path);
            const classes = [
              "tree-row",
              node.dir ? "is-folder" : "",
              doc && doc.id === activeId ? "is-active" : "",
              selected === node.path ? "is-selected" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <ContextMenu.Root key={node.path}>
                <ContextMenu.Trigger asChild>
                  <button
                    className={classes}
                    style={indent(depth)}
                    // Only when it says more than the row already does.
                    title={node.rel === node.name ? undefined : node.rel}
                    data-path={node.path}
                    onClick={() => activate(node)}
                    onContextMenu={(event) => {
                      // Only preventDefault would stop Radix; stopping the
                      // bubble keeps the folder menu out of the file menu.
                      event.stopPropagation();
                      useStore.getState().setTreeSelected(node.path);
                    }}
                  >
                    <span className="tree-name">{folded ? `${node.name} …` : node.name}</span>
                    {doc?.dirty && <span className="dot">●</span>}
                  </button>
                </ContextMenu.Trigger>
                {node.dir ? (
                  <Menu>
                    <ContextMenu.Item className="menu-item" onSelect={() => startDraft(node.path, "file")}>
                      new file
                    </ContextMenu.Item>
                    <ContextMenu.Item className="menu-item" onSelect={() => startDraft(node.path, "folder")}>
                      new folder
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="menu-item"
                      onSelect={() => void revealInExplorer(node.path)}
                    >
                      reveal in explorer
                    </ContextMenu.Item>
                    <ContextMenu.Item className="menu-item" onSelect={() => askDelete(node)}>
                      delete
                    </ContextMenu.Item>
                  </Menu>
                ) : (
                  <Menu>
                    <ContextMenu.Item className="menu-item" onSelect={() => void openPaths([node.path])}>
                      open
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="menu-item"
                      onSelect={() => useStore.getState().setTreeRenaming(node.path)}
                    >
                      rename
                    </ContextMenu.Item>
                    <ContextMenu.Item
                      className="menu-item"
                      onSelect={() => void revealInExplorer(node.path)}
                    >
                      reveal in explorer
                    </ContextMenu.Item>
                    <ContextMenu.Item className="menu-item" onSelect={() => askDelete(node)}>
                      delete
                    </ContextMenu.Item>
                  </Menu>
                )}
              </ContextMenu.Root>
            );
          })}
        </div>
      </ContextMenu.Trigger>
      {rootMenu}
    </ContextMenu.Root>
  );
}
