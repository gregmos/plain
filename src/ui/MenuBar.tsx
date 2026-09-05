// Our own menu bar (spec §4). The native Windows one draws in Segoe UI with
// its own capitals; this one is the app's typography. The entries come from
// app/menu.ts, which reads the command registry, so nothing is written twice.

import { useEffect, useReducer } from "react";
import * as Menubar from "@radix-ui/react-menubar";
import { menuModel, type MenuNode } from "../app/menu";
import { activeDoc, useStore } from "../app/store";
import { onLineNumbers } from "../editor/setup";
import "./menubar.css";

function Row({ node }: { node: MenuNode }) {
  if (node.kind === "separator") {
    return <Menubar.Separator className="mb-sep" />;
  }

  if (node.kind === "submenu") {
    return (
      <Menubar.Sub>
        <Menubar.SubTrigger className="mb-item">
          <span className="mb-check" />
          <span className="mb-label">{node.label}</span>
          <span className="mb-arrow">▸</span>
        </Menubar.SubTrigger>
        <Menubar.Portal>
          <Menubar.SubContent className="mb-content" sideOffset={-1} alignOffset={-5}>
            {node.items.map((child) => (
              <Row key={child.key} node={child} />
            ))}
          </Menubar.SubContent>
        </Menubar.Portal>
      </Menubar.Sub>
    );
  }

  return (
    <Menubar.Item className="mb-item" disabled={node.disabled} onSelect={() => node.run()}>
      <span className="mb-check">{node.checked ? "●" : ""}</span>
      <span className="mb-label">{node.label}</span>
      {node.chord && <span className="mb-chord">{node.chord}</span>}
    </Menubar.Item>
  );
}

export function MenuBar() {
  // Only what the model actually reads — the ticks, the recent list and the
  // `when()` predicates. Subscribing to the whole store would rebuild the
  // model on every keystroke, because the caret lives there too.
  useStore((s) => s.recent);
  useStore((s) => s.theme);
  useStore((s) => s.alwaysOnTop);
  useStore((s) => s.activeId);
  useStore((s) => s.libraryPath);
  useStore((s) => s.treeSelected);
  useStore((s) => activeDoc(s)?.mode);
  useStore((s) => activeDoc(s)?.path);

  // `Ctrl+Shift+9` flips the line numbers outside the store (editor/setup).
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onLineNumbers(bump), []);

  const sections = menuModel();

  return (
    <Menubar.Root className="menubar">
      {sections.map((section) => (
        <Menubar.Menu key={section.key}>
          <Menubar.Trigger className="mb-trigger">{section.label}</Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content className="mb-content" align="start" sideOffset={0}>
              {section.items.map((node) => (
                <Row key={node.key} node={node} />
              ))}
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
      ))}
    </Menubar.Root>
  );
}
