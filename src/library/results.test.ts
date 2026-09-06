import { describe, expect, it } from "vitest";
import { handlesKey, hits, openPlan, step, type SearchAnswer } from "./search";

const answer: SearchAnswer = {
  files: [
    {
      path: "C:\\lib\\a.md",
      rel: "a.md",
      name: "a.md",
      matches: [
        { line: 3, text: "one", ranges: [] },
        { line: 9, text: "two", ranges: [] },
      ],
    },
    {
      path: "C:\\lib\\notes\\b.md",
      rel: "notes/b.md",
      name: "b.md",
      matches: [{ line: 1, text: "three", ranges: [] }],
    },
  ],
  skippedLarge: 0,
  skippedUnreadable: 0,
  truncated: false,
};

describe("hits", () => {
  it("flattens the files into the lines the keyboard walks", () => {
    expect(hits(answer)).toEqual([
      { path: "C:\\lib\\a.md", line: 3 },
      { path: "C:\\lib\\a.md", line: 9 },
      { path: "C:\\lib\\notes\\b.md", line: 1 },
    ]);
  });

  it("has nothing to walk before the first answer", () => {
    expect(hits(null)).toEqual([]);
  });
});

describe("step (audit #16)", () => {
  it("moves down and up through the list", () => {
    expect(step(0, 1, 3)).toBe(1);
    expect(step(1, 1, 3)).toBe(2);
    expect(step(2, -1, 3)).toBe(1);
  });

  it("holds at the ends rather than wrapping", () => {
    expect(step(2, 1, 3)).toBe(2);
    expect(step(0, -1, 3)).toBe(0);
  });

  it("starts at the near end when nothing is chosen yet", () => {
    expect(step(-1, 1, 3)).toBe(0);
    expect(step(-1, -1, 3)).toBe(2);
  });

  it("chooses nothing out of an empty list", () => {
    expect(step(-1, 1, 0)).toBe(-1);
    expect(step(0, 1, 0)).toBe(-1);
  });
});

describe("openPlan (audit #16)", () => {
  it("keeps you in the mode you are reading in", () => {
    expect(openPlan("read", false)).toEqual({ mode: "read", jump: false });
    expect(openPlan("edit", false)).toEqual({ mode: "edit", jump: true });
  });

  it("does not pretend read can be sent to a line", () => {
    // `plain:goto-line` is the editor's; read has only heading anchors, so
    // the honest thing is to open the file and say nothing about the line.
    expect(openPlan("read", false).jump).toBe(false);
  });

  it("sends ctrl+enter to edit, at the line, from wherever you were", () => {
    for (const mode of ["read", "edit", "rich", "split"] as const) {
      expect(openPlan(mode, true)).toEqual({ mode: "edit", jump: true });
    }
  });

  it("jumps in the modes that hold an editor", () => {
    expect(openPlan("rich", false)).toEqual({ mode: "rich", jump: true });
    expect(openPlan("split", false)).toEqual({ mode: "split", jump: true });
  });

  it("opens in read when nothing is open to take the mode from", () => {
    expect(openPlan(null, false)).toEqual({ mode: "read", jump: false });
  });
});

describe("handlesKey (review #3)", () => {
  const plain = { defaultPrevented: false, onControl: false, blocked: false };

  it("walks the list and opens a result", () => {
    expect(handlesKey("ArrowDown", plain)).toBe(true);
    expect(handlesKey("ArrowUp", plain)).toBe(true);
    expect(handlesKey("Enter", plain)).toBe(true);
  });

  it("leaves every other key alone", () => {
    expect(handlesKey("Escape", plain)).toBe(false);
    expect(handlesKey("a", plain)).toBe(false);
    expect(handlesKey("Tab", plain)).toBe(false);
  });

  it("lets a button keep its own Enter", () => {
    // `Aa`, `.*` and `close` are buttons: Enter there is a click, not an
    // instruction to open the highlighted result.
    expect(handlesKey("Enter", { ...plain, onControl: true })).toBe(false);
    // Arrows still walk the list from a toggle — nothing else wants them.
    expect(handlesKey("ArrowDown", { ...plain, onControl: true })).toBe(true);
  });

  it("stands down while something is on top of the screen", () => {
    const blocked = { ...plain, blocked: true };
    expect(handlesKey("Enter", blocked)).toBe(false);
    expect(handlesKey("ArrowDown", blocked)).toBe(false);
  });

  it("stands down for a key somebody has already answered", () => {
    const done = { ...plain, defaultPrevented: true };
    expect(handlesKey("Enter", done)).toBe(false);
    expect(handlesKey("ArrowUp", done)).toBe(false);
  });
});
