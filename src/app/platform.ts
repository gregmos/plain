// The one place that knows which platform this is, and the few browser
// capabilities that differ between WebView2 and WKWebView (spec §13a).
// Everything else asks here rather than sniffing on its own.

import { inTauri } from "./env";

let forced: boolean | null = null;

/**
 * Tests drive both platforms through this; `null` hands detection back to
 * the real navigator.
 */
export function setMacForTests(value: boolean | null): void {
  forced = value;
}

function detect(): boolean {
  if (typeof navigator === "undefined") return false;
  const data = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  // userAgentData.platform is the modern one; navigator.platform still works
  // in WKWebView and is what Safari reports.
  return /mac/i.test(data?.platform ?? navigator.platform ?? "");
}

export function isMac(): boolean {
  return forced ?? detect();
}

/**
 * The app ships for Windows and macOS only, so this is the complement of
 * `isMac()` — which also means the test pin controls both (vitest.setup.ts).
 */
export function isWindows(): boolean {
  return !isMac();
}

/**
 * What the primary modifier is called here. Chords are written with `Ctrl`
 * everywhere (spec §13a); on macOS that key is ⌘.
 */
export function primaryModifierLabel(): string {
  return isMac() ? "⌘" : "ctrl";
}

/* ------------------------------------------------------------ capability */

interface IdleWindow {
  requestIdleCallback?: (fn: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
}

/**
 * `requestIdleCallback` where there is one, a timeout where there is not —
 * Safari has never shipped it (spec §13a). Returns its own canceller so no
 * caller has to know which of the two it got.
 */
export function idle(fn: () => void, timeout = 500): () => void {
  const host = window as unknown as IdleWindow;
  if (host.requestIdleCallback && host.cancelIdleCallback) {
    const handle = host.requestIdleCallback(fn, { timeout });
    return () => host.cancelIdleCallback?.(handle);
  }
  // Sooner than the timeout: this is the fallback, not the deadline.
  const handle = window.setTimeout(fn, Math.min(200, timeout));
  return () => window.clearTimeout(handle);
}

/**
 * The CSS Custom Highlight API, which read's find bar paints with. Safari
 * only has it from 17.2, so find degrades to "no highlight" without it.
 */
export function hasHighlights(): boolean {
  return (
    typeof CSS !== "undefined" &&
    (CSS as unknown as { highlights?: unknown }).highlights !== undefined &&
    typeof (globalThis as { Highlight?: unknown }).Highlight === "function"
  );
}

/**
 * Puts text on the clipboard. Goes through the Tauri plugin rather than
 * `navigator.clipboard`, which needs transient activation: on a 1 MB
 * document the render and the DOM walk take longer than the activation
 * lasts, and WebView2 then asks the user for permission (review, live run).
 * Outside Tauri — the dev server in a browser — the web API is all there is.
 */
export async function copyText(text: string): Promise<void> {
  if (inTauri) {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

/**
 * What is on the clipboard, as text. The same reason as `copyText`: reading
 * through `navigator.clipboard` makes WebView2 ask the user for permission,
 * and the app's own paste item must not do that. Empty when there is
 * nothing to paste, or when the browser refuses — the caller inserts
 * nothing rather than clearing a selection.
 */
export async function pasteText(): Promise<string> {
  if (inTauri) {
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    return (await readText()) ?? "";
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}
