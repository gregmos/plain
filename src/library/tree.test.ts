import { describe, expect, it } from "vitest";
import type { TreeNode } from "../app/store";
import { files, flatten, joinPath, nodeAt } from "./tree";

function at(rel: string): string {
  return `C:\\lib\\${rel.replace(/\//g, "\\")}`;
}

function file(name: string, rel: string): TreeNode {
  return { name, path: at(rel), rel, dir: false, unreadable: false, mtimeMs: 0, ctimeMs: 0, children: [] };
}

function folder(name: string, rel: string, children: TreeNode[]): TreeNode {
  return { name, path: at(rel), rel, dir: true, unreadable: false, mtimeMs: 0, ctimeMs: 0, children };
}

// Folders first, then files — the order Rust hands over (spec §6).
const tree: TreeNode[] = [
  folder("notes", "notes", [
    folder("archive", "notes/archive", [file("old.md", "notes/archive/old.md")]),
    file("ideas.md", "notes/ideas.md"),
  ]),
  file("readme.md", "readme.md"),
];

describe("flatten", () => {
  it("walks the whole tree when nothing is folded", () => {
    const rows = flatten(tree, new Set());
    expect(rows.map((row) => row.node.rel)).toEqual([
      "notes",
      "notes/archive",
      "notes/archive/old.md",
      "notes/ideas.md",
      "readme.md",
    ]);
  });

  it("counts depth from the root, one step per folder", () => {
    const rows = flatten(tree, new Set());
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2, 1, 0]);
  });

  it("hides what a folded folder holds, and says it is folded", () => {
    const rows = flatten(tree, new Set(["notes/archive"]));
    expect(rows.map((row) => row.node.rel)).toEqual([
      "notes",
      "notes/archive",
      "notes/ideas.md",
      "readme.md",
    ]);
    expect(rows[1]?.collapsed).toBe(true);
  });

  it("drops a whole branch when its top is folded", () => {
    const rows = flatten(tree, new Set(["notes"]));
    expect(rows.map((row) => row.node.rel)).toEqual(["notes", "readme.md"]);
  });
});

describe("files", () => {
  it("lists every file and no folder", () => {
    expect(files(tree).map((node) => node.rel)).toEqual([
      "notes/archive/old.md",
      "notes/ideas.md",
      "readme.md",
    ]);
  });
});

describe("nodeAt", () => {
  it("finds a node however the path is spelled", () => {
    expect(nodeAt(tree, "c:\\lib\\notes\\ideas.md")?.name).toBe("ideas.md");
  });

  it("says nothing for a path the tree does not hold", () => {
    expect(nodeAt(tree, "C:\\lib\\gone.md")).toBeNull();
  });
});

describe("joinPath", () => {
  it("uses the separator the folder already uses", () => {
    expect(joinPath("C:\\lib", "a.md")).toBe("C:\\lib\\a.md");
    expect(joinPath("C:\\lib\\", "a.md")).toBe("C:\\lib\\a.md");
    expect(joinPath("/home/notes", "a.md")).toBe("/home/notes/a.md");
  });
});
