// "system" leaves data-theme off so the CSS media query decides; light/dark
// stamp the attribute. matchMedia only tells us which label to show.

import type { Settings, Theme } from "./settings";

const dark = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;

export function systemTheme(): "light" | "dark" {
  return dark?.matches ? "dark" : "light";
}

export function resolveTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? systemTheme() : theme;
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

/** Ctrl+Shift+D and the status bar: "system" becomes the opposite explicitly. */
export function flipTheme(resolved: "light" | "dark"): "light" | "dark" {
  return resolved === "dark" ? "light" : "dark";
}

/**
 * fontSize and contentWidth from settings.json live only as CSS custom
 * properties; tokens.css carries the 13.5px/560px defaults.
 */
export function applyAppearance(appearance: Settings["appearance"]): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  root.setProperty("--content-font-size", `${appearance.fontSize}px`);
  root.setProperty("--content-width", `${appearance.contentWidth}px`);
  // The edit column keeps the mockup's 80px lead over the read column.
  root.setProperty("--edit-width", `${appearance.contentWidth + 80}px`);
}

/**
 * `read.codeWrap` is one CSS rule, so it rides on an attribute instead of a
 * prop threaded through the read view (spec §10).
 */
export function applyReading(read: Settings["read"]): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (read.codeWrap) root.setAttribute("data-code-wrap", "on");
  else root.removeAttribute("data-code-wrap");
}

/** Calls back when the OS theme changes; only matters while theme is "system". */
export function watchSystemTheme(onChange: (resolved: "light" | "dark") => void): () => void {
  if (!dark) return () => {};
  const handler = () => onChange(dark.matches ? "dark" : "light");
  dark.addEventListener("change", handler);
  return () => dark.removeEventListener("change", handler);
}
