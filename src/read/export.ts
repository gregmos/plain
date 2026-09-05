// Export to HTML (spec §2a): one self-contained file that looks like read.
//
// The styles come from the app's own stylesheets through `?raw`, so the
// export cannot drift away from what the reader sees. `data-theme="light"`
// on the root neutralises every dark rule in read.css, which is why the
// tokens only need their light values.
//
// No script, ever: the file has to be safe to hand to somebody.

import katexCss from "katex/dist/katex.min.css?raw";
import readCss from "../ui/read.css?raw";
import tokensCss from "../ui/tokens.css?raw";
import { inTauri } from "../app/env";
import { highlight, knownLanguage } from "./highlight";
import { imagePath } from "./dom";
import { render } from "./pipeline";
import { readingMinutes } from "./words";

/** Local images are inlined up to this; beyond it the path is left alone. */
const INLINE_LIMIT = 2 * 1024 * 1024;

export interface ExportParts {
  /** The `<title>`, and nothing else uses it. */
  title: string;
  /** The meta line above H1, already assembled, or null. */
  meta: string | null;
  /** Inner HTML of the reading column. */
  body: string;
}

/**
 * The stylesheets, handed in rather than reached for: it keeps the builder a
 * pure function of its arguments, and it is the only way a test can see them
 * (Vitest stubs CSS imports, `?raw` included — the real strings are checked
 * in the browser instead).
 */
export interface ExportStyles {
  katex: string;
  tokens: string;
  read: string;
}

export const APP_STYLES: ExportStyles = {
  katex: katexCss,
  tokens: tokensCss,
  read: readCss,
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The `:root` block of tokens.css — the light palette, values and all. */
function lightTokens(css: string): string {
  const start = css.indexOf(":root {");
  if (start < 0) return "";
  const end = css.indexOf("}", start);
  return end < 0 ? "" : css.slice(start, end + 1);
}

/** What read.css cannot say, because in the app the shell says it. */
const SHELL = `
html {
  background: var(--bg);
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: "IBM Plex Mono", ui-monospace, Consolas, monospace;
  font-size: var(--content-font-size);
  -webkit-font-smoothing: antialiased;
}
.read-column {
  padding-top: 44px;
}
.read-html a {
  cursor: auto;
}
.read-html img {
  cursor: auto;
}
`;

/** The pure half: everything below is already a string. */
export function buildExportHtml(parts: ExportParts, styles: ExportStyles = APP_STYLES): string {
  const title = escapeHtml(parts.title);
  return `<!doctype html>
<html data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${styles.katex}</style>
<style>${lightTokens(styles.tokens)}
${SHELL}
${styles.read}</style>
</head>
<body>
<div class="read-column">
${parts.meta ? `<div class="read-meta">${escapeHtml(parts.meta)}</div>` : ""}
<div class="read-html">
${parts.body}
</div>
</div>
</body>
</html>
`;
}

/* ------------------------------------------------------- the live half */

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

async function inlineImage(path: string): Promise<string | null> {
  if (!inTauri) return null;
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const mime = MIME[extension];
  if (!mime) return null;
  try {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const bytes = await readFile(path);
    if (bytes.byteLength > INLINE_LIMIT) return null;
    return `data:${mime};base64,${base64(bytes)}`;
  } catch {
    return null;
  }
}

/** Diagrams already drawn in the open read view, in document order. */
function drawnDiagrams(): string[] {
  const blocks = document.querySelectorAll(".read-html .mermaid-block .mermaid-svg");
  return [...blocks].map((node) => node.innerHTML);
}

/**
 * Builds the export for a document. Runs in the browser: it highlights code
 * the same way the reading view does, borrows diagrams the reading view has
 * already drawn, and reads local images off the disk.
 */
export async function exportHtml(
  text: string,
  title: string,
  dir: string | null,
  options: { date?: string | null; useDrawnDiagrams?: boolean } = {},
): Promise<string> {
  const result = render(text);
  const host = document.createElement("div");
  host.innerHTML = result.html;

  // Chrome the export has no use for.
  for (const node of host.querySelectorAll(".code-bar, .h-anchor, script, style, iframe")) {
    node.remove();
  }

  // Code, highlighted exactly as read highlights it.
  await Promise.all(
    [...host.querySelectorAll<HTMLElement>("code[data-lang]")].map(async (block) => {
      const lang = block.dataset["lang"] ?? "";
      if (lang === "" || lang === "mermaid" || !knownLanguage(lang)) return;
      const markup = await highlight(block.textContent ?? "", lang);
      if (!markup) return;
      block.innerHTML = markup;
      block.classList.add("shiki-code");
    }),
  );

  // Diagrams: the drawn SVG when the document is the one on screen, its
  // source otherwise — never a blank space.
  if (options.useDrawnDiagrams !== false) {
    const drawn = drawnDiagrams();
    [...host.querySelectorAll<HTMLElement>(".mermaid-block")].forEach((block, index) => {
      const svg = drawn[index];
      if (!svg) return;
      const holder = document.createElement("div");
      holder.className = "mermaid-svg";
      holder.innerHTML = svg;
      block.querySelector("pre")?.setAttribute("hidden", "");
      block.append(holder);
    });
  }

  // Images: local ones travel inside the file, the rest keep their address.
  await Promise.all(
    [...host.querySelectorAll<HTMLImageElement>("img[data-src]")].map(async (img) => {
      const raw = img.getAttribute("data-src") ?? "";
      img.removeAttribute("data-src");
      if (/^(https?:|data:)/i.test(raw)) {
        img.setAttribute("src", raw);
        return;
      }
      const path = imagePath(raw, dir);
      if (!path) return;
      img.setAttribute("src", (await inlineImage(path)) ?? path);
    }),
  );

  const line = [
    ...(options.date ? [options.date] : []),
    `${result.words.toLocaleString("en-US")} words`,
    `${readingMinutes(result.words)} min`,
  ].join(" · ");
  const shown = result.tags.slice(0, 6).map((tag) => `#${tag}`);
  const rest = result.tags.length - shown.length;
  const meta = shown.length > 0 ? `${line} · ${shown.join(" ")}${rest > 0 ? ` +${rest}` : ""}` : line;

  return buildExportHtml({ title, meta, body: host.innerHTML });
}
