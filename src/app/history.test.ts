// The diff the conflict banner and the version history both show (spec §2a),
// and the autosave clock. Snapshots themselves live in Rust (cargo test).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockOf, changeBlocks, diffRows } from "./history";
import { createAutosave } from "./save";

describe("the line diff", () => {
  it("marks a changed line as one removed and one added", () => {
    const rows = diffRows("one\ntwo\nthree\n", "one\nTWO\nthree\n");
    expect(rows).toEqual([
      { kind: "same", text: "one" },
      { kind: "removed", text: "two" },
      { kind: "added", text: "TWO" },
      { kind: "same", text: "three" },
    ]);
  });

  it("says nothing changed when nothing did", () => {
    const rows = diffRows("one\ntwo\n", "one\ntwo\n");
    expect(rows.every((row) => row.kind === "same")).toBe(true);
    expect(rows.map((row) => row.text)).toEqual(["one", "two"]);
  });

  it("does not invent an empty row for the final newline", () => {
    expect(diffRows("one\n", "one\n")).toEqual([{ kind: "same", text: "one" }]);
    // A file that ends without one still has its last line.
    expect(diffRows("one", "one")).toEqual([{ kind: "same", text: "one" }]);
  });

  it("keeps a blank line in the middle as a row of its own", () => {
    expect(diffRows("a\n\nb\n", "a\n\nb\n").map((row) => row.text)).toEqual(["a", "", "b"]);
  });

  it("reads CRLF and LF as the same text", () => {
    expect(diffRows("one\r\ntwo\r\n", "one\ntwo\n").every((r) => r.kind === "same")).toBe(true);
  });

  it("shows an added line as added and a deleted one as removed", () => {
    expect(diffRows("one\n", "one\ntwo\n")).toEqual([
      { kind: "same", text: "one" },
      { kind: "added", text: "two" },
    ]);
    expect(diffRows("one\ntwo\n", "one\n")).toEqual([
      { kind: "same", text: "one" },
      { kind: "removed", text: "two" },
    ]);
  });

  it("puts the left side on the removed rows, whichever way round it is", () => {
    // `disk · buffer`: what only the disk has is what a `take disk` restores.
    const rows = diffRows("disk only\n", "buffer only\n");
    expect(rows.find((row) => row.kind === "removed")?.text).toBe("disk only");
    expect(rows.find((row) => row.kind === "added")?.text).toBe("buffer only");
  });
});

// `previous`/`next` on the compare screen step through runs of changed
// lines, so a rewritten paragraph is one difference and not ten.
describe("stepping through the differences", () => {
  const rows = (kinds: string) =>
    [...kinds].map((c) => ({
      kind: c === "-" ? ("removed" as const) : c === "+" ? ("added" as const) : ("same" as const),
      text: c,
    }));

  it("counts a run of changed lines as one difference", () => {
    // same, removed, added, added, same, removed, same
    expect(changeBlocks(rows("=-++=-="))).toEqual([1, 5]);
  });

  it("finds nothing in a file that matches", () => {
    expect(changeBlocks(rows("===="))).toEqual([]);
  });

  it("starts at the first line when the file opens with a change", () => {
    expect(changeBlocks(rows("-==+"))).toEqual([0, 3]);
  });

  it("treats a removed line followed by its replacement as one block", () => {
    // What a single edited line looks like: one removed, one added.
    expect(changeBlocks(rows("=-+="))).toEqual([1]);
  });

  it("counts every run when the whole file changed", () => {
    expect(changeBlocks(rows("----"))).toEqual([0]);
  });

  it("says which block a line belongs to, and -1 for unchanged ones", () => {
    const lines = rows("=-++=-=");
    const starts = changeBlocks(lines);
    expect(blockOf(starts, lines, 0)).toBe(-1);
    expect(blockOf(starts, lines, 1)).toBe(0);
    expect(blockOf(starts, lines, 2)).toBe(0);
    expect(blockOf(starts, lines, 3)).toBe(0);
    expect(blockOf(starts, lines, 4)).toBe(-1);
    expect(blockOf(starts, lines, 5)).toBe(1);
    expect(blockOf(starts, lines, 6)).toBe(-1);
  });

  it("wraps around the way the buttons do", () => {
    const starts = changeBlocks(rows("=-=-=-="));
    expect(starts).toHaveLength(3);
    const step = (at: number, by: number) => (at + by + starts.length) % starts.length;
    expect(step(2, 1)).toBe(0);
    expect(step(0, -1)).toBe(2);
  });
});

describe("the autosave clock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves once, N seconds after the last change", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);

    autosave.touch("a", 2);
    vi.advanceTimersByTime(1900);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(save).toHaveBeenCalledExactlyOnceWith("a");

    // And it does not fire again on its own.
    vi.advanceTimersByTime(10_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("starts the wait again on every change", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);

    for (let step = 0; step < 5; step += 1) {
      autosave.touch("a", 2);
      vi.advanceTimersByTime(1500);
    }
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  // §2a: 0 is off, and that is the default.
  it("never fires when it is turned off", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);

    autosave.touch("a", 0);
    vi.advanceTimersByTime(60_000);
    expect(save).not.toHaveBeenCalled();
  });

  it("turning it off cancels a wait that had already started", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);

    autosave.touch("a", 5);
    vi.advanceTimersByTime(1000);
    autosave.touch("a", 0);
    vi.advanceTimersByTime(60_000);
    expect(save).not.toHaveBeenCalled();
  });

  it("gives every document its own clock", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);

    autosave.touch("a", 2);
    vi.advanceTimersByTime(1000);
    autosave.touch("b", 2);
    vi.advanceTimersByTime(1000);
    expect(save.mock.calls).toEqual([["a"]]);
    vi.advanceTimersByTime(1000);
    expect(save.mock.calls).toEqual([["a"], ["b"]]);
  });

  it("a closed document takes its clock with it", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);

    autosave.touch("a", 2);
    autosave.cancel("a");
    vi.advanceTimersByTime(10_000);
    expect(save).not.toHaveBeenCalled();
  });

  it("stopping cancels everything at once", () => {
    const save = vi.fn();
    const autosave = createAutosave(save);

    autosave.touch("a", 2);
    autosave.touch("b", 2);
    autosave.stop();
    vi.advanceTimersByTime(10_000);
    expect(save).not.toHaveBeenCalled();
  });
});
