// §8: "the buffer is clean, the file may replace it" is decided before an
// await and acted on after it. `revision` is what makes the second look
// honest — a keystroke in between has to be visible.

import { beforeEach, describe, expect, it } from "vitest";
import { makeDoc, useStore } from "./store";

beforeEach(() => {
  useStore.setState({ docs: [], activeId: null });
});

function open(text: string) {
  const doc = makeDoc({ id: "c:/notes/a.md", path: "C:/notes/a.md", text });
  useStore.getState().openDoc(doc);
  return doc.id;
}

describe("the text revision", () => {
  it("starts at zero and moves on every change to the text", () => {
    const id = open("one\n");
    expect(useStore.getState().docs[0]?.revision).toBe(0);

    useStore.getState().updateDoc(id, { text: "one two\n" });
    expect(useStore.getState().docs[0]?.revision).toBe(1);

    useStore.getState().updateDoc(id, { text: "one two three\n" });
    expect(useStore.getState().docs[0]?.revision).toBe(2);
  });

  it("stays put when the text is written back unchanged", () => {
    const id = open("one\n");
    useStore.getState().updateDoc(id, { text: "one\n" });
    useStore.getState().updateDoc(id, { caret: { line: 1, col: 2 } });
    useStore.getState().updateDoc(id, { dirty: true });
    expect(useStore.getState().docs[0]?.revision).toBe(0);
  });

  it("moves for a reload too, so a check taken before one cannot pass after", () => {
    const id = open("one\n");
    const before = useStore.getState().docs[0]?.revision ?? -1;
    useStore.getState().updateDoc(id, { text: "from disk\n", savedText: "from disk\n" });
    expect(useStore.getState().docs[0]?.revision).not.toBe(before);
  });

  it("belongs to one document only", () => {
    const first = open("one\n");
    const second = makeDoc({ id: "c:/notes/b.md", path: "C:/notes/b.md", text: "two\n" });
    useStore.getState().openDoc(second);

    useStore.getState().updateDoc(first, { text: "edited\n" });
    expect(useStore.getState().docs.find((d) => d.id === second.id)?.revision).toBe(0);
  });
});
