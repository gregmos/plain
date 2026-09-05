// The one place that knows which platform this is, and the few browser
// capabilities that differ between WebView2 and WKWebView (spec §13a).
// Everything else asks here rather than sniffing on its own.

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
