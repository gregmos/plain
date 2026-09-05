import { beforeEach, describe, expect, it } from "vitest";
import { undo } from "@codemirror/commands";
import { DEFAULTS } from "../app/settings";
import { makeDoc, type Doc } from "../app/store";
import { buffer, clearBuffers, isDirty, keepBuffer, markSaved } from "./buffers";

function doc(text: string): Doc {
  return makeDoc({ id: "test", path: "C:/notes/test.md", text, mode: "edit" });
}

beforeEach(clearBuffers);

describe("buffers", () => {
  it("keeps one state per document", () => {
    const first = buffer(doc("one"), DEFAULTS);
    expect(buffer(doc("ignored"), DEFAULTS)).toBe(first);
    expect(first.state.doc.toString()).toBe("one");
  });

  it("is clean again when undo brings the text back", () => {
    const opened = buffer(doc("one"), DEFAULTS);
    const edited = opened.state.update({ changes: { from: 3, insert: " two" } }).state;
    keepBuffer("test", edited, 0);
    expect(isDirty("test", edited.doc.toString())).toBe(true);

    let undone = edited;
    undo({ state: edited, dispatch: (tr) => (undone = tr.state) });
    expect(undone.doc.toString()).toBe("one");
    expect(isDirty("test", undone.doc.toString())).toBe(false);
  });

  it("takes a save as the new clean text", () => {
    buffer(doc("one"), DEFAULTS);
    expect(isDirty("test", "one two")).toBe(true);
    markSaved("test", "one two");
    expect(isDirty("test", "one two")).toBe(false);
  });

  // CodeMirror normalizes line endings, so a CRLF file (the Windows default)
  // would look dirty forever if the comparison used the raw text.
  it("is clean again after undo in a CRLF file", () => {
    const opened = buffer(doc("one\r\ntwo\r\n"), DEFAULTS);
    expect(opened.savedText).toBe("one\ntwo\n");
    expect(isDirty("test", opened.state.doc.toString())).toBe(false);

    const edited = opened.state.update({ changes: { from: 3, insert: " and" } }).state;
    keepBuffer("test", edited, 0);
    expect(isDirty("test", edited.doc.toString())).toBe(true);

    let undone = edited;
    undo({ state: edited, dispatch: (tr) => (undone = tr.state) });
    expect(isDirty("test", undone.doc.toString())).toBe(false);
  });

  it("compares CRLF text from outside the editor too", () => {
    buffer(doc("one\r\ntwo"), DEFAULTS);
    expect(isDirty("test", "one\r\ntwo")).toBe(false);
    markSaved("test", "one\r\nthree");
    expect(isDirty("test", "one\nthree")).toBe(false);
  });
});
