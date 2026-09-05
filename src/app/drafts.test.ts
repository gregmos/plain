import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buffer, clearBuffers, keepBuffer, markSaved } from "../editor/buffers";
import {
  DEBOUNCE_MS,
  MAX_WAIT_MS,
  createSchedule,
  draftName,
  flushDrafts,
  installDrafts,
  pendingDrafts,
} from "./drafts";
import { DEFAULTS } from "./settings";
import { makeDoc, useStore } from "./store";

describe("the draft schedule", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits for a pause of 500 ms", () => {
    const run = vi.fn();
    const schedule = createSchedule(run);

    schedule.push();
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("restarts that wait on every change", () => {
    const run = vi.fn();
    const schedule = createSchedule(run);

    for (let step = 0; step < 3; step += 1) {
      schedule.push();
      vi.advanceTimersByTime(400);
    }
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
  });

  // §8: typing that never pauses must still reach the disk every 2 s.
  it("writes anyway after 2 s of unbroken typing", () => {
    const run = vi.fn();
    const schedule = createSchedule(run);

    for (let elapsed = 0; elapsed <= MAX_WAIT_MS; elapsed += 100) {
      schedule.push();
      vi.advanceTimersByTime(100);
    }
    expect(run).toHaveBeenCalledTimes(1);

    // And the ceiling starts again from the next change.
    for (let elapsed = 0; elapsed <= MAX_WAIT_MS; elapsed += 100) {
      schedule.push();
      vi.advanceTimersByTime(100);
    }
    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe("which documents get a draft", () => {
  beforeEach(() => {
    clearBuffers();
    flushDrafts();
    useStore.setState({ docs: [], activeId: null });
  });

  it("only the dirty ones, and only while they stay dirty", () => {
    const stop = installDrafts();
    const doc = makeDoc({ id: "c:/notes/a.md", path: "C:/notes/a.md", text: "one\n" });
    useStore.getState().openDoc(doc);
    buffer(useStore.getState().docs[0]!, DEFAULTS);
    expect(pendingDrafts()).toEqual([]);

    // A change that differs from the disk text schedules a draft.
    useStore.getState().updateDoc(doc.id, { text: "one two\n" });
    expect(pendingDrafts()).toEqual([doc.id]);

    // A save makes that text the clean one; nothing more is scheduled.
    flushDrafts();
    markSaved(doc.id, "one two\n");
    useStore.getState().updateDoc(doc.id, { savedText: "one two\n", dirty: false });
    useStore.getState().updateDoc(doc.id, { caret: { line: 1, col: 1 } });
    expect(pendingDrafts()).toEqual([]);

    stop();
  });

  it("keeps a restored draft dirty even before the editor opens it", () => {
    // The buffer takes its clean text from the file on disk, not from the
    // draft — otherwise a recovered document would look saved (§8).
    const doc = makeDoc({
      id: "c:/notes/b.md",
      path: "C:/notes/b.md",
      text: "recovered\n",
      savedText: "on disk\n",
      dirty: true,
    });
    useStore.setState({ docs: [doc], activeId: doc.id });
    const opened = buffer(doc, DEFAULTS);
    expect(opened.savedText).toBe("on disk\n");
    keepBuffer(doc.id, opened.state, 0);
    expect(opened.state.doc.toString()).toBe("recovered\n");
  });
});

describe("draft names", () => {
  it("are the same for one file however the path is spelled", () => {
    expect(draftName({ id: "x", path: String.raw`C:\Notes\A.md` })).toBe(
      draftName({ id: "y", path: "c:/notes/a.md" }),
    );
  });

  it("fall back to the id for a buffer that has no file yet", () => {
    expect(draftName({ id: "untitled-1", path: null })).toMatch(/^[0-9a-f]{8}\.json$/);
    expect(draftName({ id: "untitled-1", path: null })).not.toBe(
      draftName({ id: "untitled-2", path: null }),
    );
  });
});
