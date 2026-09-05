// Mockup 1c: syntax markers muted, headings 600, quote italic, url accent.
// Everything is a token from tokens.css, so light/dark need no second theme.

import { HighlightStyle } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

/** Later entries win in CSS, so marker styling comes last. */
export const highlightStyle = HighlightStyle.define([
  { tag: t.heading, fontWeight: "600", color: "var(--fg)" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.quote, fontStyle: "italic", color: "var(--quote)" },
  { tag: t.link, color: "var(--fg)" },
  {
    tag: t.url,
    color: "var(--accent)",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
  },
  { tag: t.monospace, backgroundColor: "var(--surface)" },
  { tag: [t.comment, t.contentSeparator, t.labelName, t.atom], color: "var(--muted)" },
  // `#`, `>`, `-`, `1.`, backticks, `[`, `](`, `)` — plain weight even inside a heading.
  {
    tag: t.processingInstruction,
    color: "var(--muted)",
    fontWeight: "400",
    fontStyle: "normal",
  },
]);

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--fg)",
    backgroundColor: "transparent",
    fontFamily: "var(--font)",
    fontSize: "var(--fs-edit)",
  },
  "&.cm-focused": { outline: "none" },

  // The column is centred in the full-width scroller, so the scrollbar stays
  // at the window edge like it does in read.
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.75",
    justifyContent: "center",
    overflowY: "auto",
  },
  ".cm-content": {
    padding: "36px 0 44px",
    maxWidth: "calc(var(--edit-width) - 64px)",
  },
  ".cm-line": { padding: "0" },

  ".cm-cursor, .cm-dropCursor": {
    borderLeft: "1.5px solid var(--accent)",
    marginLeft: "-0.75px",
  },
  ".cm-selectionBackground, .cm-content ::selection": { background: "var(--selection)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    background: "var(--selection)",
  },

  // 40px numbers + 24px gap (mockup 1c), no rule, no background.
  ".cm-gutters": {
    width: "40px",
    marginRight: "24px",
    backgroundColor: "transparent",
    color: "var(--faint)",
    border: "none",
  },
  ".cm-gutter": { width: "100%" },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0",
    minWidth: "0",
    textAlign: "right",
  },

  // Front matter parses as a setext heading; it is metadata, not a title.
  ".cm-frontmatter, .cm-frontmatter span": { color: "var(--muted)", fontWeight: "400" },
  ".cm-code": { backgroundColor: "var(--surface)" },

  ".cm-searchMatch": { backgroundColor: "var(--selection)" },
  ".cm-searchMatch-selected": {
    backgroundColor: "transparent",
    outline: "1px solid var(--accent)",
  },

  ".cm-panels, .cm-panels-top, .cm-panels-bottom": {
    backgroundColor: "var(--surface)",
    color: "var(--fg)",
    border: "none",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "transparent",
    border: "none",
    color: "var(--muted)",
    padding: "0 4px",
  },
});
