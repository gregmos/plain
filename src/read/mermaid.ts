// Mermaid, imported only when a diagram actually scrolls into view
// (spec §5.1). A broken diagram shows its source plus the error line.

let mermaid: Promise<typeof import("mermaid").default> | null = null;
let configured: "light" | "dark" | null = null;
let seq = 0;

async function load(theme: "light" | "dark") {
  mermaid ??= import("mermaid").then((module) => module.default);
  const instance = await mermaid;
  if (configured !== theme) {
    instance.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: theme === "dark" ? "dark" : "neutral",
      fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
      fontSize: 12,
    });
    configured = theme;
  }
  return instance;
}

function reason(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n").slice(0, 2).join(" ").trim() || "diagram failed";
}

/**
 * Replaces the source of `block` with an SVG. On failure the source stays and
 * the message is appended, so nothing is silently lost.
 */
export async function renderDiagram(
  block: HTMLElement,
  theme: "light" | "dark",
): Promise<void> {
  const source = block.querySelector("pre")?.textContent ?? "";
  if (source.trim() === "") return;

  try {
    const instance = await load(theme);
    seq += 1;
    const { svg } = await instance.render(`plain-mermaid-${seq}`, source);
    const holder = document.createElement("div");
    holder.className = "mermaid-svg";
    holder.innerHTML = svg;
    block.querySelector("pre")?.setAttribute("hidden", "");
    block.querySelector(".mermaid-svg")?.remove();
    block.append(holder);
  } catch (error) {
    block.querySelector(".mermaid-error")?.remove();
    const note = document.createElement("div");
    note.className = "mermaid-error";
    note.textContent = reason(error);
    block.append(note);
  }
}
