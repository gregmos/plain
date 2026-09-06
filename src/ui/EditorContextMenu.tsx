// Right-click inside the editor (spec §2a). WebView2's own menu used to be
// left alone here, because it was the only way to reach cut/copy/paste — but
// it arrives in Segoe UI on a white strip, and the spelling suggestions that
// were the other reason for it never appeared: Chromium only checks text a
// person typed, and CodeMirror writes the document into the DOM itself.
//
// So the editor gets a menu of its own, in the app's type, matching read's.
// What the items do lives in editor/clipboard.ts, next to the editor rather
// than in the menu that happens to call it.

import { useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { selectAll } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { copySelection, cutSelection, pasteInto } from "../editor/clipboard";
import "./library.css";

interface Aim {
  selected: boolean;
  readOnly: boolean;
}

export function EditorContextMenu({
  children,
  view,
}: {
  children: ReactNode;
  /** The live editor. Null while the view is being built or torn down. */
  view: () => EditorView | null;
}) {
  const [aim, setAim] = useState<Aim>({ selected: false, readOnly: true });

  // Read when the menu opens, not on every render: the selection changes
  // without React hearing about it. What the items then do is decided again
  // against the live state, so a stale reading can only grey something out.
  const look = (open: boolean) => {
    if (!open) return;
    const live = view();
    setAim({
      selected: live ? !live.state.selection.main.empty : false,
      readOnly: live ? live.state.readOnly : true,
    });
  };

  const run = (fn: (view: EditorView) => void) => () => {
    const live = view();
    if (live) fn(live);
  };

  return (
    <ContextMenu.Root onOpenChange={look}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu" collisionPadding={8}>
          <ContextMenu.Item
            className="menu-item"
            disabled={!aim.selected || aim.readOnly}
            onSelect={run((live) => void cutSelection(live))}
          >
            cut
          </ContextMenu.Item>
          <ContextMenu.Item
            className="menu-item"
            disabled={!aim.selected}
            onSelect={run((live) => void copySelection(live))}
          >
            copy
          </ContextMenu.Item>
          <ContextMenu.Item
            className="menu-item"
            disabled={aim.readOnly}
            onSelect={run((live) => void pasteInto(live))}
          >
            paste
          </ContextMenu.Item>
          <ContextMenu.Separator className="menu-sep" />
          <ContextMenu.Item
            className="menu-item"
            onSelect={run((live) => {
              selectAll(live);
              live.focus();
            })}
          >
            select all
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
