// The test pack against the read pipeline (spec §16).
//
// `tests/pack/fixtures/` is committed, so this runs on a clean checkout.
// `tests/pack/generated/` is not; when it is there (`npm run pack:gen`) the
// whole 40-note library and the big files join in. The manifest carries what
// each file is supposed to be, so a mismatch is either a generator bug or a
// pipeline bug — and either way it is a finding, not a snapshot to bless.

import { describe, expect, it } from "vitest";
import { headingsOf } from "./headings";
import { resolveHref, resolveWikiLink } from "./links";
import { render } from "./pipeline";
import { countWords } from "./words";

interface PackLink {
  kind: "wikilink" | "relative";
  raw: string;
  href?: string;
  target: string;
  hash?: string | null;
  /** Resolvable as a path from the folder of the file the link is in. */
  resolvesRelative: boolean;
  /** Resolvable by name anywhere in the library — Obsidian's rule. */
  resolvesByName?: boolean;
}

interface PackEntry {
  rel: string;
  name?: string;
  source?: string;
  bytes: number;
  encoding: string;
  bom: boolean;
  eol: string;
  dominantEol: string;
  finalNewline: boolean;
  headings?: number;
  needles?: { text: string; line: number }[];
  links?: PackLink[];
}

interface FixtureManifest {
  files: PackEntry[];
}

interface GeneratedManifest {
  libraryNoteCount: number;
  files: PackEntry[];
}

/* ---------------------------------------------------------------- loading */

const fixtureText = import.meta.glob("../../tests/pack/fixtures/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const fixtureManifests = import.meta.glob("../../tests/pack/fixtures/manifest.json", {
  import: "default",
  eager: true,
}) as Record<string, FixtureManifest>;

const generatedText = import.meta.glob("../../tests/pack/generated/library/**/*.{md,markdown}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const generatedManifests = import.meta.glob("../../tests/pack/generated/manifest.json", {
  import: "default",
  eager: true,
}) as Record<string, GeneratedManifest>;

const bigFiles = import.meta.glob("../../tests/pack/generated/large/*.md", {
  query: "?raw",
  import: "default",
}) as Record<string, () => Promise<string>>;

const pathologicalText = import.meta.glob("../../tests/pack/generated/pathological/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function only<T>(record: Record<string, T>): T | null {
  const values = Object.values(record);
  return values.length === 1 ? (values[0] as T) : null;
}

const fixtures = only(fixtureManifests);
const generated = only(generatedManifests);

/** The pack's own name for a file loaded through a glob key. */
const tail = (key: string, from: string): string => key.slice(key.indexOf(from) + from.length);

/* -------------------------------------------------------------- the rules */

/**
 * Everything that must be true of any document the pack contains, checked on
 * one render — rendering twice per file doubles the run for nothing.
 *
 * Safety is §14: a `<script>`, an `on*` handler, a second way to fetch an
 * image and a `javascript:` target all have to be gone, whoever wrote them.
 * Headings are review #9: read and edit must agree about every id and line,
 * or "jump to the same heading" lands somewhere else.
 */
function checkDocument(name: string, text: string, expected?: number): void {
  const out = render(text);
  const html = out.html.toLowerCase();
  // `data-src` is deferred and inert: nothing fetches it, and `dom.ts` is
  // what decides whether it may ever become a real `src` (spec §9). Every
  // other byte of this string is live HTML and is held to the §14 rules.
  const live = html.replace(/\sdata-src="[^"]*"/g, "");

  expect(out.html, `${name} produced no html`).toBeTypeOf("string");
  expect(html, name).not.toContain("<script");
  expect(html, name).not.toContain("<iframe");
  expect(html, name).not.toContain("<style");
  expect(html, name).not.toContain("<form");
  expect(html, name).not.toContain("<textarea");
  // A second way to fetch an image would walk straight past `data-src`.
  expect(html, name).not.toContain("srcset");
  // No inline event handler survives, whatever it is called.
  expect(live, name).not.toMatch(/<[^>]+\son[a-z]+\s*=/);
  expect(live, name).not.toContain("javascript:");
  expect(live, name).not.toContain("vbscript:");
  expect(live, name).not.toContain("data:text/html");
  // Images never carry a live `src`: read stays off the network (§1.3).
  expect(out.html, name).not.toMatch(/<img[^>]*\ssrc=/i);

  expect(headingsOf(text), `${name}: headingsOf disagrees with render`).toEqual(out.headings);
  if (expected !== undefined) {
    expect(out.headings.length, `${name}: heading count`).toBe(expected);
  }
  for (const heading of out.headings) {
    expect(heading.level, name).toBeGreaterThanOrEqual(1);
    expect(heading.level, name).toBeLessThanOrEqual(6);
    expect(heading.line, name).toBeGreaterThan(0);
    if (heading.text !== "") expect(heading.id, `${name}: "${heading.text}" has no slug`).not.toBe("");
  }
  const ids = out.headings.map((heading) => heading.id).filter(Boolean);
  expect(new Set(ids).size, `${name}: duplicate slugs`).toBe(ids.length);
}

/* -------------------------------------------------------------- fixtures */

describe("pack fixtures", () => {
  it("has a manifest and every file it names", () => {
    expect(fixtures, "tests/pack/fixtures/manifest.json is missing").not.toBeNull();
    const names = new Set(Object.keys(fixtureText).map((key) => tail(key, "/fixtures/")));
    for (const entry of fixtures?.files ?? []) expect(names).toContain(entry.name);
    expect(names.size).toBe(fixtures?.files.length);
  });

  const entries = (fixtures?.files ?? []).map((entry) => ({
    name: entry.name ?? entry.rel,
    entry,
  }));

  it.each(entries)("$name renders and is safe", ({ name, entry }) => {
    const key = Object.keys(fixtureText).find((path) => path.endsWith(`/${name}`));
    expect(key, `${name} not loaded`).toBeTypeOf("string");
    const text = fixtureText[key as string] as string;
    checkDocument(name, text, entry.headings);
    expect(countWords(text), `${name}: word count`).toBeGreaterThan(0);
  });

  it("keeps the constructs read is supposed to render", () => {
    const named = (name: string): string => {
      const key = Object.keys(fixtureText).find((path) => path.endsWith(`/${name}`));
      if (!key) throw new Error(`fixture missing: ${name}`);
      return fixtureText[key] as string;
    };

    const render_ = render(named("render.md"));
    expect(render_.html).toContain('data-callout="note"');
    expect(render_.html).toContain('data-callout="warning"');
    expect(render_.html).toContain('data-callout="caution"');
    expect(render_.html).toContain("<mark>");
    expect(render_.html).toContain("<details>");
    expect(render_.html).toContain("<kbd>");
    expect(render_.html).toContain("footnotes");
    // A non-ascii callout type stays an ordinary quote.
    expect(render_.html).not.toContain('data-callout="заметка"');

    const math = render(named("math.md"));
    expect(math.html).toContain("katex");
    expect(math.html).toContain("$5 и $10");
    expect(math.html).toContain("Цена $50, налог $7.50, всего $57.50.");

    const mermaid = render(named("mermaid.md"));
    expect(mermaid.html).toContain("mermaid-block");
    expect(mermaid.html).toContain('data-lang="rust"');

    const tables = render(named("tables.md"));
    expect(tables.html).toContain("<table>");

    const todo = render(named("todo.md"));
    expect(todo.html).toContain('type="checkbox"');

    const links = render(named("links.md"));
    expect(links.html).toContain('class="wikilink"');
    expect(links.html).toContain("data-wiki=");
    expect(links.html).toContain("data-wiki-hash=");

    const diary = render(named("diary.md"));
    expect(diary.frontmatter?.["date"]).toBeTruthy();
    expect(diary.html).not.toContain("tags:");

    const dollars = render(named("dollars.md"));
    expect(dollars.html).toContain("$5 и $10, итого $15.");

    const emoji = render(named("emoji.md"));
    expect(emoji.headings[1]?.id).not.toBe("");
  });

  it("defers every image source instead of dropping it", () => {
    const key = Object.keys(fixtureText).find((path) => path.endsWith("/edge-cases.md"));
    const html = render(fixtureText[key as string] as string).html;
    // The sanitizer's protocol check never sees these: `rehypeDeferImages`
    // moves `src` into `data-src` first, so what keeps a `javascript:` or an
    // SVG data URL from ever loading is `SAFE_DATA_IMAGE` in `dom.ts`.
    // Recorded here so the next person knows where that promise lives.
    expect(html).toContain('data-src="javascript:alert(1)"');
    expect(html).toContain('data-src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="');
    expect(html).not.toMatch(/<img[^>]*\ssrc=/i);
  });

  // One slugger per document, markdown headings and raw-HTML ones alike, so
  // `<h2>Duplicate</h2>` after `## Duplicate` cannot take the same id.
  it("gives every heading in the html its own id", () => {
    const key = Object.keys(fixtureText).find((path) => path.endsWith("/edge-cases.md"));
    const html = render(fixtureText[key as string] as string).html;
    const ids = [...html.matchAll(/<h[1-6] id="([^"]*)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/* ------------------------------------------------------------- generated */

const hasLibrary = Object.keys(generatedText).length > 0;

describe.skipIf(!hasLibrary)("pack library (generated)", () => {
  const byRel = new Map((generated?.files ?? []).map((entry) => [entry.rel, entry]));

  const notes = Object.keys(generatedText)
    .map((key) => ({ key, rel: `library/${tail(key, "/generated/library/")}` }))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  it("is the whole library", () => {
    expect(notes).toHaveLength(generated?.libraryNoteCount ?? 40);
  });

  it.each(notes)("$rel renders, is safe and agrees about headings", ({ key, rel }) => {
    const text = generatedText[key] as string;
    const entry = byRel.get(rel);
    checkDocument(rel, text, entry?.headings);
    expect(countWords(text), `${rel}: word count`).toBeGreaterThan(0);
  });

  /**
   * Path resolution on the real library, which is what §16 asks for: `%20`,
   * Cyrillic, spaces, `&` and `..` all in live paths.
   *
   * Note which of the two columns is checked. Plain resolves a wikilink as a
   * **path from the folder of the file it is in** — `[[тз]]` written in
   * `index.md` means `index.md`'s folder, not "the note called тз wherever it
   * lives". The manifest records both readings; the assertion pins the one
   * the code implements, and the last check proves the pack really does
   * contain links where the two disagree (see the report).
   */
  it("resolves every recorded link the way the code resolves it", () => {
    const index = notes.map((note) => `L/${note.rel.slice("library/".length)}`);
    const paths = new Set(index);
    let byName = 0;
    let checked = 0;

    for (const { rel } of notes) {
      const entry = byRel.get(rel);
      const inside = rel.slice("library/".length);
      const dir = inside.includes("/") ? `L/${inside.slice(0, inside.lastIndexOf("/"))}` : "L";

      for (const link of entry?.links ?? []) {
        const target =
          link.kind === "wikilink"
            ? resolveWikiLink(link.target, link.hash ?? null, dir, index)
            : resolveHref(link.href ?? "", dir);
        expect(target.kind, `${rel}: ${link.raw}`).toBe("file");
        const path = target.kind === "file" ? target.path : "";
        // A wikilink resolves relative to the document, or — Obsidian's rule,
        // and the owner's decision — by name anywhere in the library.
        const reachable =
          link.kind === "wikilink"
            ? link.resolvesRelative || link.resolvesByName === true
            : link.resolvesRelative;
        expect(paths.has(path), `${rel}: ${link.raw} -> ${path}`).toBe(reachable);
        if (link.kind === "wikilink" && link.resolvesByName === true && !link.resolvesRelative) {
          byName += 1;
        }
        checked += 1;
      }
    }

    expect(checked, "the library has links to check").toBeGreaterThan(40);
    expect(
      byName,
      "the pack has to contain wikilinks that only the library index can resolve",
    ).toBeGreaterThan(0);
  });

  it("resolves every needle to the line the manifest claims", () => {
    for (const { key, rel } of notes) {
      const entry = byRel.get(rel);
      const lines = (generatedText[key] as string).replace(/\r\n|\r/g, "\n").split("\n");
      for (const needle of entry?.needles ?? []) {
        expect(lines[needle.line - 1], `${rel}:${needle.line}`).toContain(needle.text);
      }
    }
  });
});

const pathological = Object.keys(pathologicalText);

describe.skipIf(pathological.length === 0)("pack pathological (generated)", () => {
  const byRel = new Map((generated?.files ?? []).map((entry) => [entry.rel, entry]));

  const cases = pathological
    .map((key) => ({ key, rel: `pathological/${tail(key, "/generated/pathological/")}` }))
    .sort((a, b) => a.rel.localeCompare(b.rel));

  it.each(cases)("$rel does not break the pipeline", ({ key, rel }) => {
    const text = pathologicalText[key] as string;
    checkDocument(rel, text, byRel.get(rel)?.headings);
  });
});

/* ------------------------------------------------------------ the clock */

// 10 MB is deliberately left out: rendering it takes the better part of a
// minute, and §8 does not render a file over 2 MB without `render anyway`
// anyway. It is step 14 of `tests/pack/SCENARIOS.md` instead, by hand.
const bigKeys = Object.keys(bigFiles).filter((key) => !key.includes("10mb"));

// Not an assertion: §1.3 says the numbers are checked with Task Manager and
// not with tests. Reported so the run says how long a megabyte takes today.
describe.skipIf(bigKeys.length === 0)("pack large (generated)", () => {
  it(
    "reports how long render takes on the big files",
    async () => {
      const rows: string[] = [];
      for (const key of bigKeys.sort()) {
        const load = bigFiles[key];
        if (!load) continue;
        const text = await load();
        const started = performance.now();
        const out = render(text);
        const renderMs = performance.now() - started;
        const outlineStarted = performance.now();
        headingsOf(text);
        const outlineMs = performance.now() - outlineStarted;
        rows.push(
          `${tail(key, "/generated/large/").padEnd(10)} ` +
            `${(text.length / 1024 / 1024).toFixed(2)} MB chars · ` +
            `render ${renderMs.toFixed(0)} ms · outline ${outlineMs.toFixed(0)} ms · ` +
            `${out.headings.length} headings · ${out.words} words`,
        );
        expect(out.html.length).toBeGreaterThan(0);
      }
      // eslint-disable-next-line no-console
      console.log(`\n  render timings\n    ${rows.join("\n    ")}\n`);
    },
    120_000,
  );
});
