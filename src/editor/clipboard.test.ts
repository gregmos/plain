// @vitest-environment happy-dom
//
// The clipboard is a promise and the editor is one view reused for every
// document, so there is a gap between reading the selection and writing to
// the document. Everything here is about that gap (review #1).

import { beforeEach, describe, expect, it, vi } from "vitest";

const clip = vi.hoisted(() => ({
  written: "",
  read: "",
  /** Resolves the call in flight, so a test can act inside the gap. */
  release: null as null | (() => void),
  waiting: null as null | Promise<void>,
}));

// Only the clipboard is faked; the rest of the module (isMac and friends)
// is what everything else in the editor reads.
vi.mock("../app/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app/platform")>()),
  copyText: async (text: string) => {
    clip.written = text;
    if (clip.waiting) await clip.waiting;
  },
  pasteText: async () => {
    if (clip.waiting) await clip.waiting;
    return clip.read;
  },
}));

const { EditorSelection, EditorState } = await import("@codemirror/state");
const { EditorView } = await import("@codemirror/view");
const { cutSelection, pasteInto, selectedText } = await import("./clipboard");
const { setSyncTarget } = await import("./sync");
const { useStore } = await import("../app/store");

function editor(doc: string) {
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor: 0, head: 5 } }),
    parent: document.body,
  });
  return view;
}

/** Holds the next clipboard call open until the returned function is run. */
function pause(): () => void {
  let go = () => {};
  clip.waiting = new Promise<void>((done) => (go = done));
  return () => {
    clip.waiting = null;
    go();
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
  clip.written = "";
  clip.read = "";
  clip.waiting = null;
  setSyncTarget("doc-a");
  useStore.getState().setMessage(null);
});

describe("cut", () => {
  it("takes the selection out when nothing moved", async () => {
    const view = editor("hello world");
    await cutSelection(view);
    expect(clip.written).toBe("hello");
    expect(view.state.doc.toString()).toBe(" world");
    expect(useStore.getState().message).toBe("cut");
    view.destroy();
  });

  it("leaves the document alone when it changed while the clipboard waited", async () => {
    const view = editor("hello world");
    const go = pause();
    const cutting = cutSelection(view);
    // Something typed, an autosave reload, the outline moving the caret.
    view.dispatch({ changes: { from: 11, insert: "!" } });
    go();
    await cutting;
    expect(clip.written).toBe("hello");
    expect(view.state.doc.toString()).toBe("hello world!");
    expect(useStore.getState().message).toBe("selection changed — nothing cut");
    view.destroy();
  });

  it("leaves it alone when another document took the editor over", async () => {
    const view = editor("hello world");
    const go = pause();
    const cutting = cutSelection(view);
    setSyncTarget("doc-b");
    go();
    await cutting;
    expect(view.state.doc.toString()).toBe("hello world");
    expect(useStore.getState().message).toBe("selection changed — nothing cut");
    view.destroy();
  });

  it("does nothing at all with an empty selection", async () => {
    const view = new EditorView({
      state: EditorState.create({ doc: "hello" }),
      parent: document.body,
    });
    await cutSelection(view);
    expect(clip.written).toBe("");
    expect(view.state.doc.toString()).toBe("hello");
    view.destroy();
  });
});

describe("paste", () => {
  it("replaces the selection when nothing moved", async () => {
    const view = editor("hello world");
    clip.read = "goodbye";
    await pasteInto(view);
    expect(view.state.doc.toString()).toBe("goodbye world");
    view.destroy();
  });

  it("writes nothing when the document changed while the clipboard waited", async () => {
    const view = editor("hello world");
    clip.read = "goodbye";
    const go = pause();
    const pasting = pasteInto(view);
    view.dispatch({ changes: { from: 11, insert: "!" } });
    go();
    await pasting;
    expect(view.state.doc.toString()).toBe("hello world!");
    expect(useStore.getState().message).toBe("document changed — nothing pasted");
    view.destroy();
  });

  it("leaves the selection alone when the clipboard is empty", async () => {
    const view = editor("hello world");
    clip.read = "";
    await pasteInto(view);
    expect(view.state.doc.toString()).toBe("hello world");
    view.destroy();
  });
});

describe("selectedText", () => {
  it("joins the ranges of a multi-range selection", () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: "one two three",
        selection: EditorSelection.create(
          [EditorSelection.range(0, 3), EditorSelection.range(4, 7)],
          1,
        ),
        extensions: EditorState.allowMultipleSelections.of(true),
      }),
      parent: document.body,
    });
    expect(selectedText(view)).toBe("one\ntwo");
    view.destroy();
  });
});
