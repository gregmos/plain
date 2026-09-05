// The diff the conflict banner and the version history both show (spec §2a),
// and the autosave clock. Snapshots themselves live in Rust (cargo test).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { diffRows } from "./history";
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
