import { describe, expect, it } from "vitest";
import type { TreeNode } from "../app/store";
import { filterByTag, formatDate, formatWords, rows, sortRows } from "./library";
import { filesOf } from "./tags";

function file(rel: string, mtimeMs: number, ctimeMs: number): TreeNode {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  return {
    name,
    path: `C:\\lib\\${rel.replace(/\//g, "\\")}`,
    rel,
    dir: false,
    unreadable: false,
    mtimeMs,
    ctimeMs,
    children: [],
  };
}

function folder(rel: string, children: TreeNode[]): TreeNode {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  return {
    name,
    path: `C:\\lib\\${rel.replace(/\//g, "\\")}`,
    rel,
    dir: true,
    unreadable: false,
    mtimeMs: 0,
    ctimeMs: 0,
    children,
  };
}

const DAY = 24 * 60 * 60 * 1000;
const tree: TreeNode[] = [
  folder("notes", [file("notes/b.md", 300 * DAY, 100 * DAY), file("notes/a2.md", 100 * DAY, 300 * DAY)]),
  file("c.md", 200 * DAY, 200 * DAY),
  file("a10.md", 50 * DAY, 50 * DAY),
];

const list = rows(tree);

describe("rows", () => {
  it("takes every file and no folder, with the folder as a second line", () => {
    expect(list.map((row) => row.rel)).toEqual(["notes/b.md", "notes/a2.md", "c.md", "a10.md"]);
    expect(list[0]?.folder).toBe("notes");
    expect(list[2]?.folder).toBe("");
  });
});

describe("sortRows", () => {
  it("puts the newest first when sorting by modified", () => {
    expect(sortRows(list, "modified").map((r) => r.rel)).toEqual([
      "notes/b.md",
      "c.md",
      "notes/a2.md",
      "a10.md",
    ]);
  });

  it("sorts by created, which is a different order", () => {
    expect(sortRows(list, "created").map((r) => r.rel)).toEqual([
      "notes/a2.md",
      "c.md",
      "notes/b.md",
      "a10.md",
    ]);
  });

  it("sorts by path, counting numbers as numbers", () => {
    expect(sortRows(list, "name").map((r) => r.rel)).toEqual([
      "a10.md",
      "c.md",
      "notes/a2.md",
      "notes/b.md",
    ]);
  });

  it("leaves the list it was given alone", () => {
    const before = list.map((r) => r.rel);
    sortRows(list, "name");
    expect(list.map((r) => r.rel)).toEqual(before);
  });

  it("breaks a tie on the date by path, so the order never wobbles", () => {
    const same = [file("b.md", 5, 5), file("a.md", 5, 5)].map((n) => rows([n])[0]!);
    expect(sortRows(same, "modified").map((r) => r.rel)).toEqual(["a.md", "b.md"]);
  });
});

describe("filterByTag", () => {
  const tags = [
    { tag: "writing", count: 2, files: ["C:\\lib\\notes\\b.md", "C:\\LIB\\c.md"] },
    { tag: "tools", count: 0, files: [] },
  ];

  it("keeps only the files the tag is in", () => {
    const kept = filterByTag(list, filesOf(tags, "writing"));
    expect(kept.map((r) => r.rel)).toEqual(["notes/b.md", "c.md"]);
  });

  it("compares paths the way Windows does", () => {
    // `C:\LIB\c.md` is the same file as `C:\lib\c.md`.
    expect(filterByTag(list, filesOf(tags, "writing")).map((r) => r.name)).toContain("c.md");
  });

  it("shows everything when no tag is chosen", () => {
    expect(filterByTag(list, filesOf(tags, null))).toHaveLength(4);
  });

  it("shows nothing for a tag that is in no file", () => {
    expect(filterByTag(list, filesOf(tags, "tools"))).toEqual([]);
    expect(filterByTag(list, filesOf(tags, "unknown"))).toEqual([]);
  });
});

describe("formatDate", () => {
  const now = new Date(2026, 8, 5).getTime();

  it("leaves this year's date without a year", () => {
    expect(formatDate(new Date(2026, 8, 4).getTime(), now)).toBe("4 sep");
  });

  it("says the year when it is not this one", () => {
    expect(formatDate(new Date(2025, 8, 4).getTime(), now)).toBe("4 sep 2025");
  });

  it("says nothing about a date it does not have", () => {
    expect(formatDate(0, now)).toBe("");
  });
});

describe("formatWords", () => {
  it("groups thousands, the way the mockup writes it", () => {
    expect(formatWords(1204)).toBe("1,204 w");
    expect(formatWords(96)).toBe("96 w");
  });
});
