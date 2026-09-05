#!/usr/bin/env node
// The test pack generator (spec §16).
//
//   node tests/pack/generate.mjs          ->  tests/pack/generated/
//
// Everything here is deterministic: one seed, no clock, no randomness that
// is not the seeded PRNG. Running it twice produces byte-identical output,
// so a diff in `generated/` means the generator changed and nothing else.
//
// What comes out:
//   generated/library/      a realistic notes folder, 40 .md files, 3 levels
//   generated/encodings/    the same short note in every encoding and EOL
//   generated/large/        1 MB, 2.5 MB, 10 MB
//   generated/pathological/ the shapes that break parsers
//   generated/manifest.json what every file is supposed to be
//
// The 15 most telling small files are also copied into `fixtures/`, which is
// committed: the JS and Rust tests run from there without generating, and the
// generator is only needed for the big and the complete.
//
// No npm dependencies on purpose — this has to run from a clean checkout.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "generated");
const FIXTURES = join(HERE, "fixtures");

/* ------------------------------------------------------------------- rng */

/** mulberry32 — small, fast, and the same everywhere. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = 20260905;
let rand = rng(SEED);

const pick = (list) => list[Math.floor(rand() * list.length) % list.length];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

/* ------------------------------------------------------------------ text */

const RU_NOUNS = [
  "заметка", "черновик", "папка", "строка", "абзац", "шрифт", "колонка", "отступ",
  "кодировка", "перевод строки", "каретка", "выделение", "рейка", "статус-бар",
  "библиотека", "заголовок", "таблица", "сноска", "цитата", "список", "чекбокс",
  "вкладка", "окно", "тема", "поиск", "замена", "история", "снимок", "хэш",
];
const RU_ADJ = [
  "простой", "тихий", "плотный", "тёплый", "аккуратный", "короткий", "длинный",
  "прозрачный", "надёжный", "быстрый", "спокойный", "чистый", "ровный",
];
const RU_VERBS = [
  "открывается", "правится", "сохраняется", "находится", "переживает kill",
  "не теряется", "читается без лагов", "остаётся байт в байт", "перечитывается",
];
const RU_TAIL = [
  "и это главное",
  "по крайней мере на своей папке",
  "если не жать лишнего",
  "как и обещано в третьем правиле",
  "пока файл лежит на локальном диске",
  "даже на файле в мегабайт",
];

const EN_NOUNS = [
  "note", "draft", "folder", "line", "paragraph", "font", "column", "indent",
  "encoding", "line ending", "caret", "selection", "rail", "status bar",
  "library", "heading", "table", "footnote", "quote", "list", "checkbox",
];
const EN_ADJ = [
  "plain", "quiet", "dense", "warm", "tidy", "short", "long", "clear",
  "reliable", "quick", "calm", "clean", "even",
];
const EN_VERBS = [
  "opens", "edits", "saves", "is found", "survives a kill", "is never lost",
  "reads without lag", "stays byte for byte", "reloads",
];

function ruSentence() {
  const shapes = [
    () => `${cap(pick(RU_ADJ))} ${pick(RU_NOUNS)} ${pick(RU_VERBS)}, ${pick(RU_TAIL)}.`,
    () => `${cap(pick(RU_NOUNS))} ${pick(RU_VERBS)} — ${pick(RU_TAIL)}.`,
    () =>
      `Если ${pick(RU_NOUNS)} ${pick(RU_VERBS)}, то ${pick(RU_ADJ)} ${pick(RU_NOUNS)} тоже.`,
    () => `Проверил: ${pick(RU_NOUNS)} ${pick(RU_VERBS)}.`,
  ];
  return pick(shapes)();
}

function enSentence() {
  const shapes = [
    () => `The ${pick(EN_ADJ)} ${pick(EN_NOUNS)} ${pick(EN_VERBS)}.`,
    () => `A ${pick(EN_NOUNS)} ${pick(EN_VERBS)}, which is the whole point.`,
    () => `Checked again: the ${pick(EN_NOUNS)} ${pick(EN_VERBS)}.`,
  ];
  return pick(shapes)();
}

const cap = (word) => word.charAt(0).toUpperCase() + word.slice(1);

function paragraph(lang, sentences = between(2, 5)) {
  const out = [];
  for (let i = 0; i < sentences; i += 1) {
    out.push(lang === "ru" ? ruSentence() : enSentence());
  }
  return out.join(" ");
}

/* ------------------------------------------------------------------- png */

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** A real PNG: RGB8, `width` x `height`, a two-axis gradient. */
function png(width, height, tint) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 3);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const at = row + 1 + x * 3;
      raw[at] = Math.round((x * 255) / Math.max(1, width - 1));
      raw[at + 1] = Math.round((y * 255) / Math.max(1, height - 1));
      raw[at + 2] = tint & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A minimal but structurally valid JFIF header — enough to be `image/jpeg`. */
const JPEG_NOISE = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

/* --------------------------------------------------------------- cp1251 */

// windows-1251, 0x80..0xFF, as code points. Written out rather than as a
// string literal: the one undefined byte (0x98) has to be a hole, and a
// placeholder character in a literal would quietly claim a byte of its own.
const CP1251_HIGH = [
  0x0402, 0x0403, 0x201a, 0x0453, 0x201e, 0x2026, 0x2020, 0x2021,
  0x20ac, 0x2030, 0x0409, 0x2039, 0x040a, 0x040c, 0x040b, 0x040f,
  0x0452, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
  -1 /* 0x98 is undefined */, 0x2122, 0x0459, 0x203a, 0x045a, 0x045c, 0x045b, 0x045f,
  0x00a0, 0x040e, 0x045e, 0x0408, 0x00a4, 0x0490, 0x00a6, 0x00a7,
  0x0401, 0x00a9, 0x0404, 0x00ab, 0x00ac, 0x00ad, 0x00ae, 0x0407,
  0x00b0, 0x00b1, 0x0406, 0x0456, 0x0491, 0x00b5, 0x00b6, 0x00b7,
  0x0451, 0x2116, 0x0454, 0x00bb, 0x0458, 0x0405, 0x0455, 0x0457,
];

const CP1251 = new Map();
// 0x00..0x7F is ASCII, and 0xC0..0xFF is А..я in order.
for (let i = 0; i < 128; i += 1) CP1251.set(String.fromCharCode(i), i);
for (let i = 0; i < CP1251_HIGH.length; i += 1) {
  const point = CP1251_HIGH[i];
  if (point >= 0) CP1251.set(String.fromCharCode(point), 0x80 + i);
}
for (let i = 0; i < 64; i += 1) CP1251.set(String.fromCharCode(0x0410 + i), 0xc0 + i);

/** Encodes to cp1251 by hand — an unencodable character is a bug, not a `?`. */
function encodeCp1251(text) {
  const out = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const byte = CP1251.get(text[i]);
    if (byte === undefined) {
      throw new Error(`cp1251 cannot hold U+${text.codePointAt(i).toString(16)} (${text[i]})`);
    }
    out[i] = byte;
  }
  return out;
}

function encodeUtf16(text, little) {
  const out = Buffer.alloc(text.length * 2);
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (little) out.writeUInt16LE(unit, i * 2);
    else out.writeUInt16BE(unit, i * 2);
  }
  return out;
}

/* -------------------------------------------------------------- manifest */

/** Every file the pack produced, in the order it was written. */
const manifest = [];

function eolOf(text) {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.replace(/\r\n/g, "").match(/\n/g) ?? []).length;
  const cr = (text.replace(/\r\n/g, "").match(/\r/g) ?? []).length;
  const kinds = (crlf > 0) + (lf > 0) + (cr > 0);
  const dominant =
    crlf > 0 && crlf >= lf && crlf >= cr ? "crlf" : lf > 0 && lf >= cr ? "lf" : cr > 0 ? "cr" : "crlf";
  return { eol: kinds === 0 ? "none" : kinds === 1 ? dominant : "mixed", dominant };
}

/** Line numbers the way the folder search counts them: CR and CRLF are LF. */
function lineOf(text, needle) {
  const flat = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const at = flat.indexOf(needle);
  if (at < 0) throw new Error(`needle not in text: ${needle}`);
  return flat.slice(0, at).split("\n").length;
}

function record(rel, bytes, extra) {
  manifest.push({ rel: rel.replace(/\\/g, "/"), bytes: bytes.length, ...extra });
}

function writeBytes(rel, bytes, extra) {
  const full = join(OUT, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, bytes);
  record(rel, bytes, extra);
}

/**
 * A text file. `text` always arrives with `\n`; `eol` decides what lands on
 * disk, so a fixture's line endings are a property of the pack and not of
 * whatever checked it out.
 */
function writeText(rel, text, options = {}) {
  const { eol = "lf", encoding = "utf-8", bom = false, extra = {}, needles = [] } = options;
  const body = eol === "lf" ? text : eol === "crlf" ? text.replace(/\n/g, "\r\n") : text.replace(/\n/g, "\r");
  const raw = options.raw ?? body;

  let bytes;
  if (encoding === "utf-8") bytes = Buffer.from(raw, "utf8");
  else if (encoding === "utf-16le") bytes = encodeUtf16(raw, true);
  else if (encoding === "utf-16be") bytes = encodeUtf16(raw, false);
  else if (encoding === "windows-1251") bytes = encodeCp1251(raw);
  else throw new Error(`unknown encoding ${encoding}`);

  if (bom) {
    const mark =
      encoding === "utf-16le"
        ? Buffer.from([0xff, 0xfe])
        : encoding === "utf-16be"
          ? Buffer.from([0xfe, 0xff])
          : Buffer.from([0xef, 0xbb, 0xbf]);
    bytes = Buffer.concat([mark, bytes]);
  }

  const shape = eolOf(raw);
  writeBytes(rel, bytes, {
    encoding,
    bom,
    eol: shape.eol,
    dominantEol: shape.dominant,
    finalNewline: /[\r\n]$/.test(raw),
    needles: needles.map((needle) => ({ text: needle, line: lineOf(raw, needle) })),
    ...extra,
  });
  return raw;
}

/* ------------------------------------------------------------------- doc */

/**
 * A document under construction. Headings are counted as they are added
 * rather than parsed back out, so the manifest's number is an independent
 * claim the tests can check the parser against.
 */
class Doc {
  constructor(rel) {
    this.rel = rel;
    this.lines = [];
    this.headings = 0;
    this.links = [];
    this.needles = [];
  }

  line(text = "") {
    this.lines.push(text);
    return this;
  }

  blank() {
    if (this.lines.length && this.lines[this.lines.length - 1] !== "") this.lines.push("");
    return this;
  }

  /** An ATX heading; every one of these is a heading in the manifest too. */
  h(level, text) {
    this.blank();
    this.lines.push(`${"#".repeat(level)} ${text}`.trimEnd());
    this.headings += 1;
    this.blank();
    return this;
  }

  /** A setext heading — the same heading, written the other way. */
  setext(text, level = 1) {
    this.blank();
    this.lines.push(text);
    this.lines.push((level === 1 ? "=" : "-").repeat(Math.max(3, text.length)));
    this.headings += 1;
    this.blank();
    return this;
  }

  p(text) {
    this.blank();
    this.lines.push(text);
    this.blank();
    return this;
  }

  raw(block) {
    this.blank();
    for (const line of block.split("\n")) this.lines.push(line);
    this.blank();
    return this;
  }

  needle(token, lang = "ru") {
    const sentence =
      lang === "ru" ? `Отметка для поиска: ${token} — не трогать.` : `Search marker: ${token} — leave it.`;
    this.p(sentence);
    this.needles.push(token);
    return this;
  }

  link(entry) {
    this.links.push(entry);
    return this;
  }

  text() {
    // One trailing newline, never two: a file that ends in blank lines is a
    // different fixture and is written on purpose elsewhere.
    while (this.lines.length && this.lines[this.lines.length - 1] === "") this.lines.pop();
    return `${this.lines.join("\n")}\n`;
  }
}

/* --------------------------------------------------------------- library */

/** Every note in the library, with the folder it lives in. */
const NOTES = [
  "index.md",
  "readme.markdown",
  "inbox.md",
  "inbox/2026-08-28 дневник.md",
  "inbox/2026-08-29 дневник.md",
  "inbox/2026-08-30 дневник.md",
  "inbox/todo.md",
  "inbox/scratch pad.md",
  "inbox/ссылки и заметки.md",
  "проекты/обзор.md",
  "проекты/идеи.md",
  "проекты/plain/тз.md",
  "проекты/plain/рендер.md",
  "проекты/plain/сохранность.md",
  "проекты/plain/поиск.md",
  "проекты/plain/mermaid и диаграммы.md",
  "проекты/plain/формулы.md",
  "проекты/сад на балконе/план на весну.md",
  "проекты/сад на балконе/полив.md",
  "проекты/сад на балконе/семена.md",
  "work/overview.md",
  "work/onboarding.md",
  "work/meetings/2026-08-24 standup.md",
  "work/meetings/2026-08-25 standup.md",
  "work/meetings/2026-08-26 retro.md",
  "work/meetings/2026-08-27 planning.md",
  "work/meetings/notes with spaces.md",
  "work/specs/api notes.md",
  "work/specs/data model.md",
  "work/specs/edge cases.md",
  "recipes/борщ.md",
  "recipes/сырники.md",
  "recipes/pasta.md",
  "recipes/bread & butter.md",
  "study/конспект по rust.md",
  "study/typography notes.md",
  "study/2026/january.md",
  "study/2026/february.md",
  "study/2026/march.md",
  "study/2026/april.md",
];

const stem = (rel) => rel.slice(rel.lastIndexOf("/") + 1).replace(/\.(md|markdown)$/, "");
const STEMS = new Set(NOTES.map((rel) => stem(rel).toLowerCase()));

/** `[[target]]` and friends, with whether a note by that name exists. */
/** `joinPath` from `src/read/links.ts`, in the library's own rel-space. */
function joinRel(dir, rel) {
  const parts = dir === "" ? [] : dir.split("/");
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  return parts.join("/");
}

const folderOfRel = (rel) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
const HAS_EXTENSION = /\.[A-Za-z0-9]{1,8}$/;

/**
 * A wikilink, with both readings of "does it resolve" written down:
 *
 *  - `resolvesRelative` — what Plain does: the target is a path from the
 *    folder of the file the link is in (`resolveWikiLink` in links.ts).
 *  - `resolvesByName` — what Obsidian does: any note in the library whose
 *    name matches, wherever it lives.
 *
 * They disagree often, and that disagreement is the point of recording both.
 */
function wiki(doc, target, { alias = null, hash = null } = {}) {
  const inner = `${target}${hash ? `#${hash}` : ""}${alias ? `|${alias}` : ""}`;
  const withExtension = HAS_EXTENSION.test(target.trim()) ? target.trim() : `${target.trim()}.md`;
  doc.link({
    kind: "wikilink",
    raw: `[[${inner}]]`,
    target,
    hash,
    resolvesRelative: NOTES.includes(joinRel(folderOfRel(doc.rel), withExtension)),
    resolvesByName: STEMS.has(target.toLowerCase()),
  });
  return `[[${inner}]]`;
}

/** A relative markdown link, `%20`-encoded the way an editor would write it. */
function relLink(doc, from, to, label, { encode = false } = {}) {
  const fromParts = from.split("/").slice(0, -1);
  const toParts = to.split("/");
  let common = 0;
  while (common < fromParts.length && common < toParts.length - 1 && fromParts[common] === toParts[common]) {
    common += 1;
  }
  const up = "../".repeat(fromParts.length - common);
  const down = toParts.slice(common).join("/");
  const href = `${up}${down}`;
  const written = encode ? href.replace(/ /g, "%20") : href;
  doc.link({
    kind: "relative",
    raw: `[${label}](${written})`,
    href: written,
    target: to,
    resolvesRelative: NOTES.includes(to),
  });
  return `[${label}](${written})`;
}

const CALLOUTS = ["note", "tip", "important", "warning", "caution", "info", "example", "quote"];

function calloutBlock(type, title, body) {
  const head = title ? `> [!${type}] ${title}` : `> [!${type}]`;
  return [head, ...body.map((line) => (line ? `> ${line}` : ">"))].join("\n");
}

/* --------------------------------------------------- the notes themselves */

function diary(rel, date, index) {
  const doc = new Doc(rel);
  doc.raw(`---\ntitle: Дневник ${date}\ndate: ${date}\ntags: [дневник, plain]\n---`);
  doc.h(1, `Дневник ${date}`);
  doc.p(paragraph("ru", 4));
  doc.h(2, "Что сделано");
  doc.raw(
    [
      `- [x] ${paragraph("ru", 1)}`,
      `- [ ] ${paragraph("ru", 1)}`,
      `  - [ ] вложенный пункт про ${pick(RU_NOUNS)}`,
      `    - [x] и ещё глубже`,
      `- [ ] ${paragraph("ru", 1)}`,
    ].join("\n"),
  );
  doc.h(2, "Мысли");
  doc.p(`${paragraph("ru", 3)} Смотри ${wiki(doc, "index")} и ${wiki(doc, "todo", { alias: "список дел" })}.`);
  doc.p(`Ссылка вбок: ${relLink(doc, rel, "проекты/plain/тз.md", "ТЗ проекта")}.`);
  doc.needle(`иголка-дневник-${index}`);
  doc.p(paragraph("ru", 2));
  return doc;
}

function standup(rel, date, index) {
  const doc = new Doc(rel);
  doc.h(1, `Standup ${date}`);
  doc.h(2, "Yesterday");
  doc.raw([`- ${paragraph("en", 1)}`, `- ${paragraph("en", 1)}`].join("\n"));
  doc.h(2, "Today");
  doc.raw([`- ${paragraph("en", 1)}`, `- ${paragraph("en", 1)}`].join("\n"));
  doc.h(2, "Blockers");
  doc.p(`None. See ${relLink(doc, rel, "work/overview.md", "the overview")}.`);
  doc.needle(`needle-standup-${index}`, "en");
  return doc;
}

function recipe(rel, title, items, steps) {
  const doc = new Doc(rel);
  doc.raw(`---\ntitle: ${title}\ndate: 2026-07-1${items.length % 10}\n---`);
  doc.h(1, title);
  doc.p(paragraph("ru", 2));
  doc.h(2, "Ингредиенты");
  doc.raw(items.map((item) => `- ${item}`).join("\n"));
  doc.h(2, "Как готовить");
  doc.raw(steps.map((step, index) => `${index + 1}. ${step}`).join("\n"));
  doc.raw(
    calloutBlock("tip", "Совет", [
      "Соль в конце, иначе ==пересолишь==.",
      "",
      `Больше про это — в ${wiki(doc, "сырники")}.`,
    ]),
  );
  doc.needle(`иголка-рецепт-${title.length}`);
  return doc;
}

function meetingTable(rel, title, index) {
  const doc = new Doc(rel);
  doc.h(1, title);
  doc.p(paragraph("en", 2));
  doc.h(2, "Decisions");
  doc.raw(
    [
      "| what | who | when | status |",
      "|---|:--|--:|:-:|",
      `| ${paragraph("en", 1)} | anna | 2026-09-0${index} | done |`,
      `| ${paragraph("en", 1)} | boris | 2026-09-1${index} | open |`,
      `| таблица с кириллицей и \\| экранированной чертой | вера | 2026-09-2${index} | open |`,
    ].join("\n"),
  );
  doc.h(2, "Notes");
  doc.p(`${paragraph("en", 2)} See ${relLink(doc, rel, "work/specs/api notes.md", "api notes", { encode: true })}.`);
  doc.needle(`needle-meeting-${index}`, "en");
  return doc;
}

function plainProse(rel, title, lang, headings) {
  const doc = new Doc(rel);
  doc.h(1, title);
  doc.p(paragraph(lang, 4));
  for (let i = 0; i < headings; i += 1) {
    doc.h(2, lang === "ru" ? `${cap(pick(RU_ADJ))} ${pick(RU_NOUNS)} ${i + 1}` : `${cap(pick(EN_ADJ))} ${pick(EN_NOUNS)} ${i + 1}`);
    doc.p(paragraph(lang, between(2, 4)));
    if (i === 0) {
      doc.raw([`- ${paragraph(lang, 1)}`, `- ${paragraph(lang, 1)}`, `  - ${paragraph(lang, 1)}`].join("\n"));
    }
  }
  return doc;
}

function library() {
  const files = new Map();

  /* --- root ------------------------------------------------------------ */

  {
    const rel = "index.md";
    const doc = new Doc(rel);
    doc.raw(`---\ntitle: Библиотека\ndate: 2026-09-01\n---`);
    doc.h(1, "Библиотека");
    doc.p("Точка входа. Отсюда есть ссылка на всё остальное.");
    doc.h(2, "Разделы");
    doc.raw(
      [
        `- ${relLink(doc, rel, "inbox.md", "входящие")}`,
        `- ${relLink(doc, rel, "проекты/обзор.md", "проекты")}`,
        `- ${relLink(doc, rel, "work/overview.md", "работа")}`,
        `- ${relLink(doc, rel, "recipes/борщ.md", "рецепты")}`,
        `- ${relLink(doc, rel, "study/конспект по rust.md", "учёба", { encode: true })}`,
      ].join("\n"),
    );
    doc.h(2, "Wikilinks");
    doc.p(
      `Прямая: ${wiki(doc, "тз")}. С алиасом: ${wiki(doc, "рендер", { alias: "как рисуется read" })}. ` +
        `С заголовком: ${wiki(doc, "сохранность", { hash: "Атомарная запись" })}. ` +
        `Битая: ${wiki(doc, "такой-заметки-нет")} и ${wiki(doc, "missing note", { alias: "тоже мимо" })}.`,
    );
    doc.h(2, "Картинка");
    doc.p("![схема библиотеки](assets/схема.png)");
    doc.needle("иголка-индекс-001");
    files.set(rel, doc);
  }

  {
    const rel = "readme.markdown";
    const doc = new Doc(rel);
    doc.h(1, "Readme");
    doc.p("A `.markdown` file, so the extension filter has two things to match.");
    doc.p(paragraph("en", 3));
    doc.needle("needle-readme-002", "en");
    files.set(rel, doc);
  }

  {
    const rel = "inbox.md";
    const doc = new Doc(rel);
    doc.h(1, "Входящие");
    doc.p(paragraph("ru", 3));
    doc.raw(
      [
        `- ${relLink(doc, rel, "inbox/todo.md", "todo")}`,
        `- ${relLink(doc, rel, "inbox/scratch pad.md", "scratch pad", { encode: true })}`,
        `- ${relLink(doc, rel, "inbox/ссылки и заметки.md", "ссылки", { encode: true })}`,
      ].join("\n"),
    );
    doc.needle("иголка-входящие-003");
    files.set(rel, doc);
  }

  /* --- inbox ----------------------------------------------------------- */

  files.set("inbox/2026-08-28 дневник.md", diary("inbox/2026-08-28 дневник.md", "2026-08-28", 1));
  files.set("inbox/2026-08-29 дневник.md", diary("inbox/2026-08-29 дневник.md", "2026-08-29", 2));
  files.set("inbox/2026-08-30 дневник.md", diary("inbox/2026-08-30 дневник.md", "2026-08-30", 3));

  {
    const rel = "inbox/todo.md";
    const doc = new Doc(rel);
    doc.h(1, "Todo");
    doc.h(2, "Дом");
    doc.raw(
      [
        "- [ ] купить лампочки",
        "- [x] отнести коробки",
        "  - [x] разобрать верхнюю",
        "  - [ ] разобрать нижнюю",
        "    - [ ] и ту, что под ней",
        "      - [ ] совсем глубокий пункт",
        "- [ ] позвонить в сервис",
      ].join("\n"),
    );
    doc.h(2, "Plain");
    doc.raw(
      [
        "1. [x] дописать read",
        "2. [ ] дописать edit",
        "   1. [ ] списки",
        "   2. [ ] команды",
        "3. [ ] сохранность",
        "   - обычный пункт внутри нумерованного",
        "     - и ещё уровень",
      ].join("\n"),
    );
    doc.p(`Смотри ${wiki(doc, "тз", { hash: "Сохранность" })}.`);
    doc.needle("иголка-todo-004");
    files.set(rel, doc);
  }

  {
    const rel = "inbox/scratch pad.md";
    const doc = new Doc(rel);
    doc.h(1, "Scratch pad");
    doc.p("Файл с пробелом в имени — ссылки на него должны кодироваться.");
    doc.p(paragraph("en", 3));
    doc.raw("```\nтекст без языка\n```");
    doc.p("Строка с двумя пробелами на конце  \nи продолжением после hard break.");
    doc.p("Строка с обратным слэшем\\\nи продолжением.");
    doc.needle("needle-scratch-005", "en");
    files.set(rel, doc);
  }

  {
    const rel = "inbox/ссылки и заметки.md";
    const doc = new Doc(rel);
    doc.h(1, "Ссылки и заметки");
    doc.h(2, "Относительные пути");
    doc.raw(
      [
        `- ${relLink(doc, rel, "проекты/plain/тз.md", "вверх и вбок")}`,
        `- ${relLink(doc, rel, "проекты/сад на балконе/полив.md", "с пробелами и кириллицей", { encode: true })}`,
        `- ${relLink(doc, rel, "work/specs/data model.md", "без кодирования пробела")}`,
        "- [битая ссылка](../нет-такой-папки/файл.md)",
        "- [якорь в этом файле](#относительные-пути)",
        "- [внешняя](https://example.com/страница?q=1&r=2)",
        "- [почта](mailto:someone@example.com)",
      ].join("\n"),
    );
    doc.h(2, "Wikilinks");
    doc.raw(
      [
        `- ${wiki(doc, "борщ")}`,
        `- ${wiki(doc, "полив", { alias: "когда поливать" })}`,
        `- ${wiki(doc, "формулы", { hash: "Дисплейные формулы" })}`,
        `- ${wiki(doc, "нет такого файла")}`,
        `- ${wiki(doc, "тоже нет", { alias: "но с алиасом" })}`,
        `- ${wiki(doc, "и с заголовком", { hash: "Которого нет" })}`,
      ].join("\n"),
    );
    doc.h(2, "Картинки");
    doc.raw(
      [
        "![локальная](../assets/схема.png)",
        "![локальная с пробелом](../assets/диаграмма%20сети.png)",
        "![внешняя](https://example.com/remote.png)",
        '![с титулом](../assets/точка.png "подпись")',
      ].join("\n"),
    );
    doc.needle("иголка-ссылки-006");
    files.set(rel, doc);
  }

  /* --- проекты --------------------------------------------------------- */

  {
    const rel = "проекты/обзор.md";
    const doc = new Doc(rel);
    doc.h(1, "Проекты");
    doc.p(paragraph("ru", 3));
    doc.raw(
      [
        `- ${relLink(doc, rel, "проекты/plain/тз.md", "Plain")}`,
        `- ${relLink(doc, rel, "проекты/сад на балконе/план на весну.md", "Сад", { encode: true })}`,
      ].join("\n"),
    );
    doc.needle("иголка-проекты-007");
    files.set(rel, doc);
  }

  files.set("проекты/идеи.md", plainProse("проекты/идеи.md", "Идеи", "ru", 3));
  {
    const doc = files.get("проекты/идеи.md");
    doc.needle("иголка-идеи-008");
  }

  {
    const rel = "проекты/plain/тз.md";
    const doc = new Doc(rel);
    doc.raw(`---\ntitle: ТЗ Plain\ndate: 2026-09-05\nversion: 2.2\n---`);
    doc.h(1, "ТЗ Plain");
    doc.p(paragraph("ru", 3));
    doc.h(2, "Три правила");
    doc.raw(
      [
        "1. **Файл — источник истины.** Байты, которых никто не касался, не меняются.",
        "2. **Ноль сети.** Единственный запрос — внешняя картинка после клика.",
        "3. **Комфортно.** Открыть и поправить без ожидания.",
      ].join("\n"),
    );
    doc.h(2, "Сохранность");
    doc.p(`Подробности — в ${wiki(doc, "сохранность")}.`);
    doc.h(2, "Поиск");
    doc.p(`Подробности — в ${wiki(doc, "поиск", { alias: "поиск по папке" })}.`);
    doc.needle("иголка-тз-009");
    files.set(rel, doc);
  }

  {
    const rel = "проекты/plain/рендер.md";
    const doc = new Doc(rel);
    doc.h(1, "Рендер");
    doc.p("Всё, что read умеет показать, собрано здесь в одном файле.");

    doc.h(2, "Callouts");
    for (const type of CALLOUTS) {
      doc.raw(calloutBlock(type, type === "note" ? null : `Заголовок ${type}`, [paragraph("ru", 1)]));
    }
    doc.raw(
      calloutBlock("warning", "Вложенное содержимое", [
        "- пункт списка внутри",
        "- второй пункт",
        "",
        "```js",
        "const inside = true;",
        "```",
        "",
        "> и цитата внутри callout",
      ]),
    );
    doc.raw(calloutBlock("ЗАМЕТКА", null, ["Не-ascii тип — это просто цитата."]));
    doc.raw("> Обычная цитата, всё ещё цитата.");

    doc.h(2, "Разметка");
    doc.p(
      "**жирный**, *курсив*, ~~зачёркнутый~~, `код`, ==подсветка== и ==вторая подсветка== " +
        "в одном абзаце.",
    );
    doc.raw(
      [
        "- [ ] чекбокс",
        "- [x] отмеченный",
        "",
        "Term list не поддерживается, и это нормально.",
      ].join("\n"),
    );

    doc.h(2, "Сырой HTML");
    doc.raw(
      [
        "<details>",
        "<summary>что внутри</summary>",
        "",
        "Скрытый абзац с **разметкой** и списком:",
        "",
        "- один",
        "- два",
        "",
        "</details>",
      ].join("\n"),
    );
    doc.p("Оставляем <b>жирный</b>, <em>курсив</em>, <kbd>Ctrl</kbd>+<kbd>S</kbd>, <sub>под</sub> и <sup>над</sup>.");
    doc.raw(
      [
        "<script>window.stolen = 1</script>",
        "",
        '<div onclick="alert(1)">кликабельный div</div>',
        "",
        "<picture><source srcset=\"../assets/схема.png\"><img src=\"../assets/точка.png\" alt=\"picture\"></picture>",
        "",
        '<a href="javascript:alert(1)">опасная ссылка</a>',
        "",
        '<img src="x" onerror="alert(1)" alt="broken">',
        "",
        "<iframe src=\"https://example.com\"></iframe>",
        "",
        '<style>body { display: none }</style>',
        "",
        '<form action="/x"><input name="q"><textarea></textarea></form>',
      ].join("\n"),
    );

    doc.h(2, "Сноски");
    doc.p("Абзац со сноской[^один] и второй[^два].");
    doc.raw(["[^один]: Первая сноска.", "[^два]: Вторая сноска с `кодом`."].join("\n"));
    doc.needle("иголка-рендер-010");
    files.set(rel, doc);
  }

  {
    const rel = "проекты/plain/сохранность.md";
    const doc = new Doc(rel);
    doc.h(1, "Сохранность");
    doc.p(paragraph("ru", 3));
    doc.h(2, "Атомарная запись");
    doc.raw(
      [
        "| шаг | что делает | почему |",
        "|---|---|---|",
        "| temp | пишет рядом | чтобы не портить оригинал |",
        "| flush | `FlushFileBuffers` | чтобы байты доехали |",
        "| replace | `ReplaceFileW` | сохраняет creation time |",
      ].join("\n"),
    );
    doc.h(2, "Кодировки");
    doc.raw(
      [
        "| кодировка | чтение | запись |",
        "|:--|:-:|--:|",
        "| utf-8 | да | да |",
        "| utf-8 bom | да | да, BOM как был |",
        "| utf-16 | да | да |",
        "| cp1251 | да | после подтверждения в utf-8 |",
      ].join("\n"),
    );
    doc.h(2, "Черновики");
    doc.p(paragraph("ru", 3));
    doc.raw(
      calloutBlock("important", "Не терять текст", [
        "Черновик удаляется только после подтверждённого сохранения.",
      ]),
    );
    doc.needle("иголка-сохранность-011");
    files.set(rel, doc);
  }

  {
    const rel = "проекты/plain/поиск.md";
    const doc = new Doc(rel);
    doc.h(1, "Поиск");
    doc.p(paragraph("ru", 3));
    doc.h(2, "Что ищется");
    doc.raw(["- подстрока без учёта регистра", "- regex по тумблеру", "- файлы больше 2 МБ пропускаются"].join("\n"));
    doc.needle("иголка-поиск-012");
    doc.p("Ещё одна строка с тем же словом иголка-поиск-012 — дублей быть не должно в счёте файлов.");
    files.set(rel, doc);
  }

  {
    const rel = "проекты/plain/mermaid и диаграммы.md";
    const doc = new Doc(rel);
    doc.h(1, "Mermaid и диаграммы");
    doc.h(2, "Валидная диаграмма");
    doc.raw(
      [
        "```mermaid",
        "graph TD",
        "  A[открыть файл] --> B{есть правки?}",
        "  B -- да --> C[записать атомарно]",
        "  B -- нет --> D[ничего не писать]",
        "```",
      ].join("\n"),
    );
    doc.h(2, "Битая диаграмма");
    doc.raw(["```mermaid", "graph TD", "  A --> ((((", "  ??? not a diagram", "```"].join("\n"));
    doc.h(2, "Просто код");
    doc.raw(
      [
        "```ts",
        "export function render(text: string): string {",
        '  return text.trim(); // $5 не формула',
        "}",
        "```",
      ].join("\n"),
    );
    doc.raw(["```rust", "fn main() {", '    println!("привет");', "}", "```"].join("\n"));
    doc.raw(["```unknown-language-xyz", "ничего не подсветится", "```"].join("\n"));
    doc.needle("иголка-mermaid-013");
    files.set(rel, doc);
  }

  {
    const rel = "проекты/plain/формулы.md";
    const doc = new Doc(rel);
    doc.h(1, "Формулы");
    doc.h(2, "Инлайновые формулы");
    doc.p("Пусть $a^2 + b^2 = c^2$, тогда $\\sqrt{a^2+b^2}$ — гипотенуза.");
    doc.p("Ещё: $E = mc^2$ и $\\frac{1}{2}$ в одном абзаце.");
    doc.h(2, "Дисплейные формулы");
    doc.raw(["$$", "\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}", "$$"].join("\n"));
    doc.raw(["$$", "\\begin{aligned}", "a &= b + c \\\\", "d &= e - f", "\\end{aligned}", "$$"].join("\n"));
    doc.h(2, "Валюта");
    doc.p("Скидка $5 и $10, итого $15 — это не формулы.");
    doc.p("Цена $50, налог $7.50, всего $57.50.");
    doc.p("Смешанный случай: $x$ формула, а $5 нет.");
    doc.h(2, "Битая формула");
    doc.p("Здесь $\\frac{1}{$ незакрытая скобка.");
    doc.raw(["$$", "\\begin{unknownenv} x \\end{unknownenv}", "$$"].join("\n"));
    doc.needle("иголка-формулы-014");
    files.set(rel, doc);
  }

  {
    const rel = "проекты/сад на балконе/план на весну.md";
    const doc = new Doc(rel);
    doc.raw(`---\ntitle: План на весну\ndate: 2026-03-01\n---`);
    doc.h(1, "План на весну");
    doc.p(paragraph("ru", 3));
    doc.raw(["- [ ] купить землю", "- [ ] посеять базилик", "- [x] помыть горшки"].join("\n"));
    doc.p(`Про полив — ${wiki(doc, "полив")}, про семена — ${wiki(doc, "семена")}.`);
    doc.needle("иголка-сад-015");
    files.set(rel, doc);
  }

  files.set("проекты/сад на балконе/полив.md", plainProse("проекты/сад на балконе/полив.md", "Полив", "ru", 2));
  files.get("проекты/сад на балконе/полив.md").needle("иголка-полив-016");
  files.set("проекты/сад на балконе/семена.md", plainProse("проекты/сад на балконе/семена.md", "Семена", "ru", 2));
  files.get("проекты/сад на балконе/семена.md").needle("иголка-семена-017");

  /* --- work ------------------------------------------------------------ */

  files.set("work/overview.md", plainProse("work/overview.md", "Overview", "en", 3));
  files.get("work/overview.md").needle("needle-overview-018", "en");
  files.set("work/onboarding.md", plainProse("work/onboarding.md", "Onboarding", "en", 3));
  files.get("work/onboarding.md").needle("needle-onboarding-019", "en");

  files.set("work/meetings/2026-08-24 standup.md", standup("work/meetings/2026-08-24 standup.md", "2026-08-24", 1));
  files.set("work/meetings/2026-08-25 standup.md", standup("work/meetings/2026-08-25 standup.md", "2026-08-25", 2));
  files.set("work/meetings/2026-08-26 retro.md", meetingTable("work/meetings/2026-08-26 retro.md", "Retro 2026-08-26", 3));
  files.set(
    "work/meetings/2026-08-27 planning.md",
    meetingTable("work/meetings/2026-08-27 planning.md", "Planning 2026-08-27", 4),
  );
  files.set("work/meetings/notes with spaces.md", plainProse("work/meetings/notes with spaces.md", "Notes with spaces", "en", 2));
  files.get("work/meetings/notes with spaces.md").needle("needle-spaces-020", "en");

  files.set("work/specs/api notes.md", plainProse("work/specs/api notes.md", "API notes", "en", 3));
  files.get("work/specs/api notes.md").needle("needle-api-021", "en");
  files.set("work/specs/data model.md", plainProse("work/specs/data model.md", "Data model", "en", 3));
  files.get("work/specs/data model.md").needle("needle-data-022", "en");

  {
    const rel = "work/specs/edge cases.md";
    const doc = new Doc(rel);
    doc.setext("Edge cases", 1);
    doc.p("A setext H1 above, and a setext H2 below.");
    doc.setext("Setext level two", 2);
    doc.p(paragraph("en", 2));

    doc.h(2, "Duplicate");
    doc.p("First one.");
    doc.h(2, "Duplicate");
    doc.p("Second one — the slugs have to differ.");
    doc.h(2, "Duplicate");
    doc.p("Third one.");

    doc.h(2, "");
    doc.p("A heading with no text at all, right above this line.");

    doc.h(2, "Escapes");
    doc.p("Not emphasis: \\*stars\\*, not a link: \\[\\[brackets\\]\\], not a heading: \\# hash.");
    doc.p("Entities: &amp; &#42; &#x2A; &copy;.");

    doc.h(2, "Empty things");
    doc.raw(["- ", "- an empty item above"].join("\n"));
    doc.raw(["|  |  |", "|---|---|", "|  | a table with blanks |"].join("\n"));
    doc.raw(["> ", "> a quote that starts empty"].join("\n"));

    doc.h(2, "Fences that look like headings");
    doc.raw(["```md", "# not a heading", "## also not a heading", "```"].join("\n"));
    doc.raw(["    # an indented code block, also not a heading", "    ## and another"].join("\n"));

    doc.h(2, "Raw html we do not keep");
    doc.raw(
      [
        '<script>alert("edge")</script>',
        "",
        '<button onclick="alert(2)">no</button>',
        "",
        '<picture><source srcset="a.png 1x, b.png 2x"><img src="a.png" alt="p"></picture>',
        "",
        "<a href=\"javascript:void(0)\">no</a>",
        "",
        '<img srcset="a.png 1x, b.png 2x" src="a.png" alt="bare set attribute">',
        "",
        '<a href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">data link</a>',
      ].join("\n"),
    );

    doc.h(2, "Image sources nobody should follow");
    doc.raw(
      [
        // §14: `data:image/*` is fine in an `<img>`, SVG is not, and a
        // script protocol is not a picture at all. Read defers every source
        // into `data-src`, so what makes these safe lives in `dom.ts`.
        "![svg](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)",
        "",
        "![png](data:image/png;base64,iVBORw0KGgo=)",
        "",
        "![js](javascript:alert(1))",
        "",
        '<img src="vbscript:msgbox(1)" alt="vb">',
      ].join("\n"),
    );

    doc.h(2, "Headings written as html");
    doc.p("The two below carry the same words as the markdown headings above.");
    doc.raw(["<h2>Duplicate</h2>", "", "<h3>Escapes</h3>"].join("\n"));

    doc.h(2, "Long line");
    doc.p(`Очень длинная строка без переносов: ${"а".repeat(600)} конец.`);
    doc.needle("needle-edge-023", "en");
    files.set(rel, doc);
  }

  /* --- recipes --------------------------------------------------------- */

  files.set(
    "recipes/борщ.md",
    recipe(
      "recipes/борщ.md",
      "Борщ",
      ["свёкла — 2 шт.", "капуста — 300 г", "картофель — 3 шт.", "томатная паста — 2 ст. л."],
      ["Сварить бульон.", "Обжарить свёклу с пастой.", "Добавить овощи и варить 20 минут."],
    ),
  );
  files.set(
    "recipes/сырники.md",
    recipe(
      "recipes/сырники.md",
      "Сырники",
      ["творог — 400 г", "яйцо — 1 шт.", "мука — 3 ст. л."],
      ["Смешать.", "Слепить.", "Жарить по три минуты с каждой стороны."],
    ),
  );
  files.set(
    "recipes/pasta.md",
    recipe(
      "recipes/pasta.md",
      "Паста с чесноком",
      ["спагетти — 200 г", "чеснок — 4 зубчика", "оливковое масло — 3 ст. л."],
      ["Отварить пасту.", "Прогреть чеснок в масле.", "Соединить и подать."],
    ),
  );
  files.set(
    "recipes/bread & butter.md",
    recipe(
      "recipes/bread & butter.md",
      "Хлеб и масло",
      ["хлеб — 1 буханка", "масло — 100 г"],
      ["Отрезать.", "Намазать."],
    ),
  );

  /* --- study ----------------------------------------------------------- */

  {
    const rel = "study/конспект по rust.md";
    const doc = new Doc(rel);
    doc.raw(`---\ntitle: Конспект по Rust\ndate: 2026-06-14\n---`);
    doc.h(1, "Конспект по Rust");
    doc.h(2, "Владение");
    doc.p(paragraph("ru", 3));
    doc.raw(["```rust", "let a = String::from(\"привет\");", "let b = a; // a больше не владеет", "```"].join("\n"));
    doc.h(2, "Заимствование");
    doc.p(paragraph("ru", 2));
    doc.raw(
      calloutBlock("note", "Правило", ["Одна изменяемая ссылка или сколько угодно неизменяемых."]),
    );
    doc.h(2, "Времена жизни");
    doc.p("Обозначаются `'a`, читаются как «живёт не меньше, чем».");
    doc.needle("иголка-rust-024");
    files.set(rel, doc);
  }

  files.set("study/typography notes.md", plainProse("study/typography notes.md", "Typography notes", "en", 3));
  files.get("study/typography notes.md").needle("needle-typography-025", "en");

  for (const [index, month] of ["january", "february", "march", "april"].entries()) {
    const rel = `study/2026/${month}.md`;
    const doc = plainProse(rel, cap(month), index % 2 === 0 ? "en" : "ru", 2);
    doc.needle(`needle-month-${month}`, index % 2 === 0 ? "en" : "ru");
    files.set(rel, doc);
  }

  return files;
}

/* ------------------------------------------------------------- encodings */

const ENCODING_SOURCE = [
  "# Проверка кодировок",
  "",
  "Первая строка на русском: тёплый шрифт, ёлка, №5, «кавычки».",
  "A second line in English, plain and short.",
  "",
  "## Список",
  "",
  "- первый пункт",
  "- второй пункт",
  "",
  "Последний абзац с иголкой encoding-needle и точкой.",
  "",
].join("\n");

function encodings() {
  const base = ENCODING_SOURCE;
  const needles = ["encoding-needle"];

  writeText("encodings/utf8-lf.md", base, { eol: "lf", needles });
  writeText("encodings/utf8-crlf.md", base, { eol: "crlf", needles });
  writeText("encodings/utf8-cr.md", base, { eol: "cr", needles });
  writeText("encodings/utf8-bom-lf.md", base, { eol: "lf", bom: true, needles });
  writeText("encodings/utf8-bom-crlf.md", base, { eol: "crlf", bom: true, needles });
  writeText("encodings/utf16le-bom-crlf.md", base, { eol: "crlf", encoding: "utf-16le", bom: true, needles });
  writeText("encodings/utf16le-bom-lf.md", base, { eol: "lf", encoding: "utf-16le", bom: true, needles });
  writeText("encodings/utf16be-bom-crlf.md", base, { eol: "crlf", encoding: "utf-16be", bom: true, needles });
  writeText("encodings/cp1251-crlf.md", base, { eol: "crlf", encoding: "windows-1251", needles });
  writeText("encodings/cp1251-lf.md", base, { eol: "lf", encoding: "windows-1251", needles });

  // Mixed endings: the one transformation §8 allows, in both directions.
  const mixedCrlf = "первая\r\nвторая\nтретья\r\nчетвёртая\r\nпятая\n";
  writeText("encodings/mixed-crlf-dominant.md", "", { raw: mixedCrlf, extra: { note: "crlf wins" } });
  const mixedLf = "первая\nвторая\r\nтретья\nчетвёртая\nпятая\r\n";
  writeText("encodings/mixed-lf-dominant.md", "", { raw: mixedLf, extra: { note: "lf wins" } });
  const mixedCr = "первая\rвторая\nтретья\rчетвёртая\r";
  writeText("encodings/mixed-cr-dominant.md", "", { raw: mixedCr, extra: { note: "cr wins" } });

  // A lone CR inside a line, among LF line breaks.
  writeText("encodings/cr-inside-line.md", "", {
    raw: "заголовок\n\nстрока с\rвозвратом каретки внутри\nи ещё строка\n",
    extra: { note: "a lone CR inside a line makes the file mixed" },
  });

  writeText("encodings/no-final-newline.md", "", { raw: "# Без финального перевода строки\n\nПоследняя строка." });
  writeText("encodings/one-line-no-newline.md", "", { raw: "одна строка без перевода строки в конце" });
  writeText("encodings/empty.md", "", { raw: "" });
  writeText("encodings/only-newline.md", "", { raw: "\n" });
  writeText("encodings/trailing-spaces.md", "", {
    raw: "# Trailing\r\n\r\nСтрока с двумя пробелами  \r\nследующая строка   \r\nи третья\t\r\n",
    extra: { note: "trailing spaces and a trailing tab are load-bearing bytes" },
  });
  writeText("encodings/tabs.md", "", {
    raw: "# Tabs\n\n-\tпункт через таб\n\t- вложенный через таб\n\nfn main() {\n\tprintln!(\"tab indented\");\n}\n",
  });

  // A NUL byte is valid UTF-8 and must round-trip; the file is not "broken".
  writeText("encodings/nul-byte.md", "", {
    raw: "# NUL\n\nдо\u0000после — нулевой байт внутри валидного UTF-8.\n",
    extra: { decodeErrors: false, note: "NUL is valid UTF-8" },
  });

  // Truncated UTF-16: an unpaired high surrogate. Decoding cannot be clean.
  const broken = Buffer.concat([
    Buffer.from([0xff, 0xfe]),
    encodeUtf16("# Broken\n\nтекст ", true),
    Buffer.from([0x00, 0xd8]), // lone high surrogate
    encodeUtf16(" хвост\n", true),
  ]);
  writeBytes("encodings/broken-utf16.md", broken, {
    encoding: "utf-16le",
    bom: true,
    eol: "lf",
    dominantEol: "lf",
    finalNewline: true,
    needles: [],
    decodeErrors: true,
    note: "unpaired surrogate: decoding produces U+FFFD, so a save would change bytes",
  });

  // Bytes that are not valid UTF-8 and not really any encoding either.
  const invalid = Buffer.concat([
    Buffer.from("# Invalid\n\n", "utf8"),
    Buffer.from([0xc3, 0x28, 0xa0, 0xa1, 0xf0, 0x28, 0x8c, 0x28]),
    Buffer.from("\n", "utf8"),
  ]);
  writeBytes("encodings/invalid-utf8.md", invalid, {
    encoding: "detected",
    bom: false,
    eol: "lf",
    dominantEol: "lf",
    finalNewline: true,
    needles: [],
    note: "chardetng guesses a legacy encoding; the point is that nothing panics",
  });
}

/* ----------------------------------------------------------------- large */

/**
 * Realistic prose with headings, grown until the file is at least `bytes`
 * long — bytes on disk, not JavaScript characters: a Cyrillic letter is two
 * of them, and a "1 MB" fixture that is really 2 MB would be a different test.
 */
function bigProse(bytes, lang) {
  const width = (piece) => Buffer.byteLength(piece, "utf8");
  const parts = ["# Большой файл\n\n"];
  let size = width(parts[0]);
  let section = 0;
  while (size < bytes) {
    section += 1;
    const head = `\n## Раздел ${section}\n\n`;
    parts.push(head);
    size += width(head);
    for (let i = 0; i < 6 && size < bytes; i += 1) {
      const body = `${paragraph(lang, 6)}\n\n`;
      parts.push(body);
      size += width(body);
    }
    if (section % 5 === 0 && size < bytes) {
      const list = `- ${paragraph(lang, 1)}\n- ${paragraph(lang, 1)}\n- ${paragraph(lang, 1)}\n\n`;
      parts.push(list);
      size += width(list);
    }
    if (section % 7 === 0 && size < bytes) {
      const code = "```ts\nconst x = 1;\n```\n\n";
      parts.push(code);
      size += width(code);
    }
  }
  return parts.join("");
}

function large() {
  const mb = 1024 * 1024;
  for (const [name, size] of [
    ["1mb.md", mb],
    ["2.5mb.md", Math.floor(2.5 * mb)],
    ["10mb.md", 10 * mb],
  ]) {
    // Byte length, not character length: Cyrillic is two bytes a letter.
    let text = bigProse(size, "ru");
    while (Buffer.byteLength(text, "utf8") < size) text += `${paragraph("ru", 6)}\n\n`;
    writeText(`large/${name}`, text, { eol: "lf", extra: { note: "prose with headings" } });
  }
}

/* ---------------------------------------------------------- pathological */

function pathological() {
  const p = (name, text, extra = {}) => writeText(`pathological/${name}`, text, { eol: "lf", extra });

  // 100 KB on one line.
  p(
    "one-long-line.md",
    `# Одна строка\n\n${"слово ".repeat(9000)}конец-строки-маркер\n`,
    { headings: 1, note: "~100 KB in a single line" },
  );

  // 5000 unchecked boxes.
  p("5000-checkboxes.md", `# Чекбоксы\n\n${"- [ ] пункт\n".repeat(5000)}`, { headings: 1, note: "5000 task items" });

  // 200 levels of quoting.
  {
    const lines = [];
    for (let depth = 1; depth <= 200; depth += 1) lines.push(`${"> ".repeat(depth)}уровень ${depth}`);
    p("deep-quotes.md", `# Цитаты\n\n${lines.join("\n")}\n`, { headings: 1, note: "200 nested blockquotes" });
  }

  // Fences that never close, in several flavours.
  p(
    "unclosed-fences.md",
    [
      "# Незакрытые ограждения",
      "",
      "```js",
      "const never = 'closed';",
      "",
      "## Это уже не заголовок, а часть блока",
      "",
      "~~~",
      "и второй вид ограждения",
      "",
      "````",
      "и четыре бэктика",
      "",
    ].join("\n"),
    { headings: 1, note: "everything after the first fence is code" },
  );

  // Dollars everywhere.
  p(
    "dollars.md",
    [
      "# Доллары",
      "",
      "$5 и $10, итого $15.",
      "",
      "$ пробел после доллара $ и ещё $.",
      "",
      "$$ пустая дисплейная $$",
      "",
      "$a$ $b$ $c$ подряд.",
      "",
      "$100 000 $ — незакрытое.",
      "",
      "`$5` в коде и $5 рядом.",
      "",
      "$".repeat(200),
      "",
      "Строка с $x^2$ формулой и $20 ценой в одном месте.",
      "",
    ].join("\n"),
    { headings: 1, note: "the currency guard of §11" },
  );

  // A thousand headings.
  {
    const lines = ["# Тысяча заголовков", ""];
    for (let i = 1; i <= 999; i += 1) {
      lines.push(`## Заголовок ${i}`, "", `Абзац ${i}.`, "");
    }
    p("1000-headings.md", `${lines.join("\n")}`, { headings: 1000, note: "1000 headings" });
  }

  // List nesting that goes far past anything sane.
  {
    const lines = ["# Глубокие списки", ""];
    for (let depth = 0; depth < 60; depth += 1) lines.push(`${" ".repeat(depth * 2)}- уровень ${depth + 1}`);
    lines.push("");
    for (let depth = 0; depth < 40; depth += 1) lines.push(`${" ".repeat(depth * 3)}1. номер ${depth + 1}`);
    lines.push("");
    p("deep-lists.md", lines.join("\n"), { headings: 1, note: "60 levels of bullets, 40 of numbers" });
  }

  // Emoji, surrogate pairs, ZWJ sequences, skin tones, combining marks.
  p(
    "emoji-zwj.md",
    [
      "# Эмодзи 🧪",
      "",
      "Семья: 👨‍👩‍👧‍👦 и ещё раз 👨‍👩‍👧‍👦.",
      "",
      "Тон кожи: 👋🏽 👋🏿 👋🏻.",
      "",
      "Флаги: 🇷🇺 🇬🇧 🇯🇵.",
      "",
      "Комбинирующие: é ä й (e + acute, a + diaeresis, и + breve).",
      "",
      "Суррогатная пара в тексте: 𝔽𝕠𝕟𝕥 и 𝓼𝓬𝓻𝓲𝓹𝓽.",
      "",
      "## Заголовок с 🧪 эмодзи",
      "",
      "Слаг такого заголовка тоже должен быть непустым.",
      "",
    ].join("\n"),
    { headings: 2, note: "grapheme clusters vs UTF-16 units" },
  );

  // Right-to-left, mixed with Latin and digits.
  p(
    "rtl.md",
    [
      "# نص عربي",
      "",
      "هذا سطر بالعربية مع كلمة English في المنتصف ورقم 42.",
      "",
      "עברית: שורה בעברית עם מילה English ומספר 7.",
      "",
      "- عنصر أول",
      "- عنصر ثانٍ",
      "",
      "| عمود | column |",
      "|---|---|",
      "| قيمة | value |",
      "",
    ].join("\n"),
    { headings: 1, note: "bidi text" },
  );

  // A NUL byte in the middle of otherwise ordinary markdown.
  p("nul-inside.md", "# NUL внутри\n\nдо\u0000после\n\n- пункт\u0000с нулём\n", {
    headings: 1,
    note: "valid UTF-8, but not printable",
  });

  // Tables that do not line up, and one that is enormous.
  {
    const rows = [];
    for (let i = 0; i < 300; i += 1) rows.push(`| ${i} | значение ${i} | ${i % 2 === 0 ? "да" : "нет"} |`);
    p(
      "ragged-tables.md",
      [
        "# Таблицы",
        "",
        "| a | b |",
        "|---|",
        "| одна ячейка |",
        "| три | ячейки | лишняя |",
        "",
        "| n | v | flag |",
        "|---|---|---|",
        ...rows,
        "",
      ].join("\n"),
      { headings: 1, note: "ragged and large tables" },
    );
  }

  // Wikilinks in every broken shape.
  p(
    "wikilink-edges.md",
    [
      "# Wikilinks",
      "",
      "Пустая: [[]] и [[ ]] и [[|]].",
      "",
      "Только заголовок: [[#Заголовок]].",
      "",
      "Незакрытая: [[открытая скобка.",
      "",
      "Вложенная: [[a[[b]]c]].",
      "",
      "В коде: `[[не ссылка]]` и в блоке:",
      "",
      "```",
      "[[тоже не ссылка]]",
      "```",
      "",
      "Экранированная: \\[\\[не ссылка\\]\\].",
      "",
      "С переводом строки внутри: [[начало",
      "конец]].",
      "",
    ].join("\n"),
    { headings: 1, note: "the wikilink extension's edges" },
  );
}

/* ------------------------------------------------------------------ main */

function main() {
  rand = rng(SEED);
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  /* library */
  const notes = library();
  const missing = NOTES.filter((rel) => !notes.has(rel));
  if (missing.length) throw new Error(`notes declared but not written: ${missing.join(", ")}`);
  if (notes.size !== NOTES.length) throw new Error(`wrote ${notes.size} notes, expected ${NOTES.length}`);

  // Two notes are CRLF on purpose: the search has to count their lines the
  // same way, and a save has to give them back byte for byte.
  const CRLF_NOTES = new Set(["work/overview.md", "recipes/pasta.md"]);

  for (const rel of NOTES) {
    const doc = notes.get(rel);
    writeText(`library/${rel}`, doc.text(), {
      eol: CRLF_NOTES.has(rel) ? "crlf" : "lf",
      needles: doc.needles,
      extra: { headings: doc.headings, links: doc.links },
    });
  }

  /* images */
  writeBytes("library/assets/схема.png", png(64, 40, 0x40), { kind: "image" });
  writeBytes("library/assets/диаграмма сети.png", png(48, 48, 0x80), { kind: "image" });
  writeBytes("library/assets/точка.png", png(1, 1, 0xc0), { kind: "image" });
  writeBytes("library/проекты/plain/assets/схема.png", png(32, 32, 0x20), { kind: "image" });

  /* noise: none of this may show up in the tree or the search */
  writeBytes("library/.git/config", Buffer.from("[core]\n\trepositoryformatversion = 0\n", "utf8"), {
    kind: "noise",
  });
  writeText("library/.git/COMMIT_EDITMSG.md", "# git\n\nнойз-иголка-git внутри .git\n", {
    eol: "lf",
    extra: { kind: "noise" },
  });
  writeText("library/.obsidian/hidden.md", "# obsidian\n\nнойз-иголка-obsidian внутри .obsidian\n", {
    eol: "lf",
    extra: { kind: "noise" },
  });
  writeBytes("library/.obsidian/workspace.json", Buffer.from("{}\n", "utf8"), { kind: "noise" });
  writeText("library/node_modules/some-package/readme.md", "# dep\n\nнойз-иголка-node внутри node_modules\n", {
    eol: "lf",
    extra: { kind: "noise" },
  });
  writeText("library/.hidden/secret.md", "# hidden\n\nнойз-иголка-hidden внутри точечной папки\n", {
    eol: "lf",
    extra: { kind: "noise" },
  });
  writeText("library/notes.txt", "не markdown, и в дереве его быть не должно\n", {
    eol: "lf",
    extra: { kind: "noise" },
  });
  writeBytes("library/image.jpg", JPEG_NOISE, { kind: "noise" });
  mkdirSync(join(OUT, "library", "empty-folder"), { recursive: true });

  encodings();
  large();
  pathological();

  /* manifest */
  const mdFiles = manifest.filter(
    (entry) =>
      entry.rel.startsWith("library/") &&
      /\.(md|markdown)$/i.test(entry.rel) &&
      entry.kind !== "noise" &&
      entry.kind !== "image",
  );
  if (mdFiles.length !== NOTES.length) {
    throw new Error(`manifest has ${mdFiles.length} library notes, expected ${NOTES.length}`);
  }

  const payload = {
    seed: SEED,
    generator: "tests/pack/generate.mjs",
    libraryNoteCount: NOTES.length,
    files: manifest,
  };
  writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  /* fixtures — the committed subset */
  fixtures();

  const total = manifest.length;
  const bytes = manifest.reduce((sum, entry) => sum + entry.bytes, 0);
  process.stdout.write(
    `pack: ${total} files, ${(bytes / 1024 / 1024).toFixed(1)} MB in ${OUT}\n` +
      `      ${NOTES.length} library notes, ${manifest.filter((f) => f.rel.startsWith("encodings/")).length} encoding variants\n`,
  );
}

/* -------------------------------------------------------------- fixtures */

/** The small, telling files that are committed so tests run without me. */
const FIXTURE_LIST = [
  ["library/index.md", "index.md"],
  ["library/inbox/todo.md", "todo.md"],
  ["library/inbox/ссылки и заметки.md", "links.md"],
  ["library/inbox/2026-08-28 дневник.md", "diary.md"],
  ["library/проекты/plain/рендер.md", "render.md"],
  ["library/проекты/plain/формулы.md", "math.md"],
  ["library/проекты/plain/mermaid и диаграммы.md", "mermaid.md"],
  ["library/проекты/plain/сохранность.md", "tables.md"],
  ["library/work/meetings/2026-08-26 retro.md", "retro.md"],
  ["library/work/specs/edge cases.md", "edge-cases.md"],
  ["library/study/конспект по rust.md", "rust.md"],
  ["library/recipes/борщ.md", "recipe.md"],
  ["pathological/emoji-zwj.md", "emoji.md"],
  ["pathological/dollars.md", "dollars.md"],
  ["pathological/unclosed-fences.md", "unclosed-fences.md"],
  ["pathological/wikilink-edges.md", "wikilink-edges.md"],
];

function fixtures() {
  rmSync(FIXTURES, { recursive: true, force: true });
  mkdirSync(FIXTURES, { recursive: true });
  mkdirSync(join(FIXTURES, "encodings"), { recursive: true });

  const byRel = new Map(manifest.map((entry) => [entry.rel, entry]));
  const files = [];

  for (const [source, name] of FIXTURE_LIST) {
    const entry = byRel.get(source);
    if (!entry) throw new Error(`fixture source missing: ${source}`);
    if (entry.bytes > 50 * 1024) throw new Error(`fixture too big (${entry.bytes} B): ${source}`);
    cpSync(join(OUT, source), join(FIXTURES, name));
    files.push({ ...entry, name, source });
  }

  // Every encoding variant, byte for byte — this is what `cargo test` reads.
  const encodingFiles = [];
  for (const entry of manifest.filter((item) => item.rel.startsWith("encodings/"))) {
    const name = entry.rel.slice("encodings/".length);
    cpSync(join(OUT, entry.rel), join(FIXTURES, "encodings", name));
    encodingFiles.push({ ...entry, name });
  }

  writeFileSync(
    join(FIXTURES, "manifest.json"),
    `${JSON.stringify({ seed: SEED, files, encodings: encodingFiles }, null, 2)}\n`,
    "utf8",
  );

  // The same encoding fixtures as base64, for the Vitest side: the browser
  // build has no `node:fs`, and `?raw` would mangle UTF-16 on the way in.
  writeFileSync(
    join(FIXTURES, "encodings.json"),
    `${JSON.stringify(
      {
        files: encodingFiles.map((entry) => ({
          ...entry,
          base64: readFileSync(join(FIXTURES, "encodings", entry.name)).toString("base64"),
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  writeFileSync(
    join(FIXTURES, ".gitattributes"),
    "# These files are bytes, not text: git must not touch their line endings.\n* -text\n",
    "utf8",
  );
}

main();
