// Right-click inside the rendered document (spec §2a). The editor keeps
// WebView2's own menu — it is the only way to reach cut/copy/paste and the
// Windows spelling suggestions — so this one is read's alone.
//
// It hands the element back rather than a resolved target: read already
// knows how to follow a link and open an image, and knowing it twice is how
// the two drift apart.

import { useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { copyPlainText } from "../app/commands";
import { useStore } from "../app/store";
import "./library.css";

async function toClipboard(text: string, said: string): Promise<void> {
  const store = useStore.getState();
  try {
    await navigator.clipboard.writeText(text);
    store.setMessage(said);
  } catch {
    store.setMessage("couldn't copy");
  }
}

export function ReadContextMenu({
  children,
  onOpenLink,
  onOpenImage,
}: {
  children: ReactNode;
  onOpenLink: (link: HTMLAnchorElement) => void;
  onOpenImage: (image: HTMLImageElement) => void;
}) {
  const [link, setLink] = useState<HTMLAnchorElement | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  const aim = (node: EventTarget | null) => {
    const el = node instanceof HTMLElement ? node : null;
    const img = el?.closest("img");
    const a = el?.closest("a");
    // A missing wikilink is not a link you can open.
    setImage(img instanceof HTMLImageElement && img.dataset["path"] ? img : null);
    setLink(a instanceof HTMLAnchorElement && !a.classList.contains("is-missing") ? a : null);
  };

  const copySelection = () => {
    const selection = window.getSelection()?.toString() ?? "";
    if (selection === "") {
      useStore.getState().setMessage("nothing selected");
      return;
    }
    void toClipboard(selection, "copied");
  };

  const selectAll = () => {
    const body = document.querySelector(".read-html");
    if (!body) return;
    const range = document.createRange();
    range.selectNodeContents(body);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild onContextMenu={(event) => aim(event.target)}>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu" collisionPadding={8}>
          <ContextMenu.Item className="menu-item" onSelect={copySelection}>
            copy
          </ContextMenu.Item>
          <ContextMenu.Item className="menu-item" onSelect={() => void copyPlainText()}>
            copy as plain text
          </ContextMenu.Item>
          <ContextMenu.Item className="menu-item" onSelect={selectAll}>
            select all
          </ContextMenu.Item>

          {link && (
            <>
              <ContextMenu.Separator className="menu-sep" />
              <ContextMenu.Item className="menu-item" onSelect={() => onOpenLink(link)}>
                open link
              </ContextMenu.Item>
              <ContextMenu.Item
                className="menu-item"
                onSelect={() =>
                  void toClipboard(
                    // What the document says, not what the browser made of it.
                    link.dataset["wiki"] ?? link.getAttribute("href") ?? "",
                    "link copied",
                  )
                }
              >
                copy link
              </ContextMenu.Item>
            </>
          )}

          {image && (
            <>
              <ContextMenu.Separator className="menu-sep" />
              <ContextMenu.Item className="menu-item" onSelect={() => onOpenImage(image)}>
                open image
              </ContextMenu.Item>
              <ContextMenu.Item
                className="menu-item"
                onSelect={() => void toClipboard(image.dataset["path"] ?? "", "path copied")}
              >
                copy path
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
