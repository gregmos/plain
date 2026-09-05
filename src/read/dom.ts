// What happens to the rendered HTML once it is in the document: heading
// anchors, syntax highlighting, lazy diagrams and images (spec §5.1, §9).
//
// Every step is idempotent — React's strict mode runs effects twice, and a
// second pass must not add a second `#` to every heading.

import { exists } from "@tauri-apps/plugin-fs";
import { inTauri } from "../app/env";
import { allowAssetDir, assetUrl, isAllowedPath } from "./assets";
import { highlight } from "./highlight";
import { decode, folderOf, isAbsolutePath, joinPath, resolveWikiLink } from "./links";
import { renderDiagram } from "./mermaid";

export interface EnhanceOptions {
  /** Folder of the open file; relative paths resolve against it. */
  dir: string | null;
  theme: "light" | "dark";
}

const SAFE_DATA_IMAGE = /^data:image\/(png|jpeg|jpg|gif|webp|avif|bmp|x-icon);/i;

function holder(text: string, action: string, attrs: Record<string, string>): HTMLElement {
  const node = document.createElement("span");
  node.className = "img-holder";
  node.dataset["action"] = action;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.textContent = text;
  return node;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "external";
  }
}

/** Absolute path of a local image reference, or null when unresolvable. */
export function imagePath(raw: string, dir: string | null): string | null {
  const path = decode(raw);
  if (isAbsolutePath(path)) return path.replace(/\\/g, "/");
  if (!dir) return null;
  return joinPath(dir, path);
}

function anchors(root: HTMLElement): void {
  for (const heading of root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
    if (!heading.id || heading.querySelector(".h-anchor")) continue;
    const link = document.createElement("button");
    link.type = "button";
    link.className = "h-anchor";
    link.dataset["slug"] = heading.id;
    link.textContent = "#";
    heading.prepend(link);
  }
}

function images(root: HTMLElement, dir: string | null): void {
  for (const img of root.querySelectorAll<HTMLImageElement>("img[data-src]")) {
    const raw = img.getAttribute("data-src") ?? "";
    img.removeAttribute("data-src");

    // Nothing is fetched before the reader asks for it (spec §1.3, rule 2).
    if (/^https?:/i.test(raw)) {
      img.hidden = true;
      img.before(holder(`${hostOf(raw)} · load`, "load", { "data-url": raw }));
      continue;
    }

    if (/^data:/i.test(raw)) {
      if (SAFE_DATA_IMAGE.test(raw)) img.src = raw;
      else img.replaceWith(holder("inline image blocked", "none", {}));
      continue;
    }

    const path = imagePath(raw, dir);
    if (!path) {
      img.replaceWith(holder("no folder for this image", "none", {}));
      continue;
    }

    img.dataset["path"] = path;

    if (!isAllowedPath(path)) {
      img.hidden = true;
      img.before(holder("outside folder · allow", "allow", { "data-dir": folderOf(path) }));
      continue;
    }

    img.addEventListener(
      "error",
      () => {
        if (img.dataset["failed"]) return;
        img.dataset["failed"] = "1";
        img.hidden = true;
        img.before(holder("couldn't load this image", "none", {}));
      },
      { once: true },
    );
    img.src = assetUrl(path);
  }
}

/** Turns a placeholder back into a picture. Called from the click handler. */
export async function revealImage(node: HTMLElement): Promise<void> {
  const action = node.dataset["action"];
  const img = node.nextElementSibling;
  if (!(img instanceof HTMLImageElement)) return;

  if (action === "load") {
    img.src = node.getAttribute("data-url") ?? "";
  } else if (action === "allow") {
    const path = img.dataset["path"];
    if (!path) return;
    if (!(await allowAssetDir(node.getAttribute("data-dir")))) return;
    img.src = assetUrl(path);
  } else {
    return;
  }
  img.hidden = false;
  node.remove();
}

function code(root: HTMLElement): void {
  for (const block of root.querySelectorAll<HTMLElement>("code[data-lang]")) {
    const lang = block.dataset["lang"] ?? "";
    if (lang === "" || lang === "mermaid" || block.dataset["hl"]) continue;
    const source = block.textContent ?? "";
    // The mark goes on only once the markup is in, so a pass that is torn
    // down mid-flight (a theme switch) does not leave the block plain.
    void highlight(source, lang).then((markup) => {
      if (!markup || !block.isConnected || block.dataset["hl"]) return;
      block.dataset["hl"] = "1";
      block.innerHTML = markup;
      block.classList.add("shiki-code");
    });
  }
}

function diagrams(root: HTMLElement, theme: "light" | "dark"): IntersectionObserver | null {
  // The mark carries the theme, so a light/dark switch redraws the diagram.
  const blocks = [...root.querySelectorAll<HTMLElement>(".mermaid-block")].filter(
    (block) => block.dataset["drawn"] !== theme,
  );
  if (blocks.length === 0) return null;

  const draw = (block: HTMLElement) => {
    if (block.dataset["drawn"] === theme) return;
    block.dataset["drawn"] = theme;
    void renderDiagram(block, theme);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        draw(entry.target as HTMLElement);
      }
    },
    { rootMargin: "200px" },
  );

  for (const block of blocks) {
    // A window that is hidden or throttled never gets the observer's first
    // record, so whatever is already on screen is drawn right away.
    const box = block.getBoundingClientRect();
    if (box.top < window.innerHeight + 200 && box.bottom > -200) draw(block);
    else observer.observe(block);
  }
  return observer;
}

/**
 * A wikilink to a file that is not there is muted and dead (spec §5.1). The
 * check is lazy and one file at a time — a document has a handful of them.
 */
async function wikilinks(
  root: HTMLElement,
  dir: string | null,
  alive: () => boolean,
): Promise<void> {
  for (const link of root.querySelectorAll<HTMLElement>("a.wikilink")) {
    if (link.dataset["checked"]) continue;
    link.dataset["checked"] = "1";
    const target = resolveWikiLink(link.dataset["wiki"] ?? "", null, dir);
    if (target.kind !== "file") {
      link.classList.add("is-missing");
      continue;
    }
    link.dataset["path"] = target.path;
    if (!inTauri) continue;
    // A path we cannot even ask about stays clickable; opening it will say why.
    const there = await exists(target.path).catch(() => true);
    if (!alive()) return;
    if (!there) link.classList.add("is-missing");
  }
}

/** Runs the whole pass; the returned function stops anything still pending. */
export function enhance(root: HTMLElement, options: EnhanceOptions): () => void {
  let live = true;
  anchors(root);
  images(root, options.dir);
  code(root);
  void wikilinks(root, options.dir, () => live);
  const observer = diagrams(root, options.theme);

  return () => {
    live = false;
    observer?.disconnect();
  };
}
