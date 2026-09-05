// Shiki, fine-grained: the core, the JS regex engine and one grammar per
// language actually seen in a document (spec §5.1, §15).
//
// Two themes built from the app palette, emitted together with
// `defaultColor: false`, so every token carries `--shiki-light` and
// `--shiki-dark` and switching theme is pure CSS — no re-highlighting.

import type { HighlighterCore, ThemeRegistrationRaw } from "shiki/core";

/** Monochrome plus the one purple accent, same as the rest of the app. */
function theme(
  name: string,
  type: "light" | "dark",
  p: { fg: string; muted: string; soft: string; quote: string; accent: string; bg: string },
): ThemeRegistrationRaw {
  return {
    name,
    type,
    colors: { "editor.background": p.bg, "editor.foreground": p.fg },
    settings: [
      { settings: { foreground: p.fg, background: p.bg } },
      {
        scope: ["comment", "punctuation.definition.comment", "string.comment"],
        settings: { foreground: p.soft, fontStyle: "italic" },
      },
      {
        scope: ["string", "constant.other.symbol", "string.regexp", "meta.embedded.line"],
        settings: { foreground: p.quote },
      },
      {
        scope: [
          "keyword",
          "storage",
          "storage.type",
          "storage.modifier",
          "keyword.control",
          "keyword.operator.new",
          "keyword.operator.expression",
          "constant.language",
          "constant.numeric",
          "support.type.primitive",
          "variable.language",
        ],
        settings: { foreground: p.accent },
      },
      {
        scope: [
          "punctuation",
          "meta.brace",
          "keyword.operator",
          "punctuation.definition.tag",
          "punctuation.separator",
        ],
        settings: { foreground: p.muted },
      },
      {
        scope: ["entity.name.tag", "entity.other.attribute-name", "support.type.property-name"],
        settings: { foreground: p.fg },
      },
      { scope: ["invalid", "invalid.illegal"], settings: { foreground: p.accent } },
    ],
  };
}

const LIGHT = theme("plain-light", "light", {
  fg: "#1c1b19",
  muted: "#8a877f",
  soft: "#8a877f",
  quote: "#5c5a54",
  accent: "#7c3aed",
  bg: "#eeebe4",
});

const DARK = theme("plain-dark", "dark", {
  fg: "#e8e6e1",
  muted: "#7a776f",
  soft: "#7a776f",
  quote: "#a9a69f",
  accent: "#a78bfa",
  bg: "#1f1e1c",
});

/** The ~12 languages of spec §5.1, plus the spellings people actually write. */
const GRAMMARS: Record<string, () => Promise<unknown>> = {
  javascript: () => import("shiki/langs/javascript.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
};

const ALIASES: Record<string, string> = {
  js: "javascript",
  javascript: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "tsx",
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  json: "json",
  jsonc: "json",
  html: "html",
  xml: "html",
  css: "css",
  md: "markdown",
  markdown: "markdown",
  sh: "shellscript",
  bash: "shellscript",
  shell: "shellscript",
  zsh: "shellscript",
  console: "shellscript",
  py: "python",
  python: "python",
  rs: "rust",
  rust: "rust",
  yml: "yaml",
  yaml: "yaml",
  sql: "sql",
};

let core: Promise<HighlighterCore> | null = null;
const loaded = new Set<string>();

async function highlighter(): Promise<HighlighterCore> {
  core ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
    ]);
    return createHighlighterCore({
      themes: [LIGHT, DARK],
      langs: [],
      // No wasm: the JS engine is enough for these grammars, and `forgiving`
      // means one unsupported pattern does not lose the whole language.
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  })();
  return core;
}

export function knownLanguage(lang: string): boolean {
  return lang.toLowerCase() in ALIASES;
}

/**
 * Highlighted markup for the inside of a `<code>` element, or null when the
 * language is unknown or the grammar fails to load — the caller then leaves
 * the plain text alone.
 */
export async function highlight(code: string, lang: string): Promise<string | null> {
  const id = ALIASES[lang.toLowerCase()];
  const load = id ? GRAMMARS[id] : undefined;
  if (!id || !load) return null;

  try {
    const shiki = await highlighter();
    if (!loaded.has(id)) {
      await shiki.loadLanguage((await load()) as Parameters<HighlighterCore["loadLanguage"]>[0]);
      loaded.add(id);
    }
    const html = shiki.codeToHtml(code, {
      lang: id,
      themes: { light: "plain-light", dark: "plain-dark" },
      defaultColor: false,
    });
    const parsed = new DOMParser().parseFromString(html, "text/html");
    return parsed.querySelector("pre code")?.innerHTML ?? null;
  } catch {
    return null;
  }
}
