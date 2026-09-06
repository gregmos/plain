// One screen at a time (spec §4). Two of them used to stack, with the second
// invisible under the first until you closed it.

import { beforeEach, describe, expect, it } from "vitest";
import { makeDoc, useStore } from "./store";

beforeEach(() => {
  useStore.getState().closeScreen();
  useStore.setState({ docs: [], activeId: null, libraryFilterTag: null });
});

describe("screen", () => {
  it("opening one closes the one that was up", () => {
    const store = useStore.getState();
    store.openScreen("settings");
    expect(useStore.getState().screen).toBe("settings");
    store.openScreen("shortcuts");
    expect(useStore.getState().screen).toBe("shortcuts");
  });

  it("closes back to the document", () => {
    useStore.getState().openScreen("library");
    useStore.getState().closeScreen();
    expect(useStore.getState().screen).toBeNull();
  });

  it("toggles: the same command twice is a way back", () => {
    const store = useStore.getState();
    store.toggleScreen("library");
    expect(useStore.getState().screen).toBe("library");
    store.toggleScreen("library");
    expect(useStore.getState().screen).toBeNull();
  });

  it("toggling a different screen switches rather than closing", () => {
    const store = useStore.getState();
    store.toggleScreen("library");
    store.toggleScreen("settings");
    expect(useStore.getState().screen).toBe("settings");
  });

  it("takes the library's tag filter with it", () => {
    useStore.getState().toggleLibraryFilter("draft");
    expect(useStore.getState().screen).toBe("library");
    useStore.getState().openScreen("settings");
    expect(useStore.getState().libraryFilterTag).toBeNull();
  });

  it("drops the data of the screen it leaves", () => {
    useStore.getState().setHistory("doc-1");
    expect(useStore.getState().screen).toBe("history");
    useStore.getState().openScreen("settings");
    expect(useStore.getState().history).toBeNull();
  });

  it("returns from the diff to the history it was opened from", () => {
    useStore.getState().setHistory("doc-1");
    useStore.getState().setComparison({
      id: "doc-1",
      left: "a",
      right: "b",
      leftLabel: "mine",
      rightLabel: "theirs",
      takeLabel: "take",
      fromDisk: false,
    });
    expect(useStore.getState().screen).toBe("comparison");
    useStore.getState().setComparison(null);
    expect(useStore.getState().screen).toBe("history");
  });

  it("returns to the document when the diff came from the conflict banner", () => {
    useStore.getState().setComparison({
      id: "doc-1",
      left: "a",
      right: "b",
      leftLabel: "mine",
      rightLabel: "theirs",
      takeLabel: "take",
      fromDisk: true,
    });
    useStore.getState().setComparison(null);
    expect(useStore.getState().screen).toBeNull();
  });

  it("steps aside when a document is made current", () => {
    useStore.setState({ docs: [], activeId: null });
    useStore.getState().openScreen("library");
    useStore.getState().activate("doc-1");
    expect(useStore.getState().screen).toBeNull();
  });

  it("steps aside when a mode is picked in the mode bar", () => {
    useStore.getState().openScreen("settings");
    useStore.getState().setMode("edit");
    expect(useStore.getState().screen).toBeNull();
  });
});

describe("a screen and the documents under it", () => {
  const two = () => {
    const store = useStore.getState();
    store.openDoc(makeDoc({ id: "a", path: "C:/a.md", text: "a" }));
    store.openDoc(makeDoc({ id: "b", path: "C:/b.md", text: "b" }));
  };

  it("goes when Ctrl+Tab moves to another document", () => {
    two();
    useStore.getState().setComparison({
      id: "b",
      left: "a",
      right: "b",
      leftLabel: "mine",
      rightLabel: "theirs",
      takeLabel: "take",
      fromDisk: false,
    });
    expect(useStore.getState().screen).toBe("comparison");
    useStore.getState().cycleDoc(1);
    expect(useStore.getState().screen).toBeNull();
    expect(useStore.getState().comparison).toBeNull();
  });

  it("goes when the document it is about is closed", () => {
    two();
    useStore.getState().setHistory("b");
    expect(useStore.getState().screen).toBe("history");
    // Closing the *other* document: the one on screen is still active, but
    // the history it was listing is gone with it.
    useStore.getState().activate("a");
    useStore.getState().setHistory("b");
    useStore.getState().closeDoc("b");
    expect(useStore.getState().screen).toBeNull();
    expect(useStore.getState().history).toBeNull();
  });

  it("stays when some unrelated document is closed", () => {
    two();
    useStore.getState().openDoc(makeDoc({ id: "c", path: "C:/c.md", text: "c" }));
    useStore.getState().setHistory("c");
    useStore.getState().closeDoc("a");
    expect(useStore.getState().screen).toBe("history");
    expect(useStore.getState().history).toBe("c");
  });

  it("goes when the active document is closed", () => {
    two();
    useStore.getState().openScreen("settings");
    useStore.getState().closeDoc("b");
    expect(useStore.getState().screen).toBeNull();
  });

  it("goes when a new untitled document is opened over it", () => {
    useStore.getState().openScreen("settings");
    useStore.getState().openDoc(makeDoc({ id: "new", path: null, text: "" }));
    expect(useStore.getState().screen).toBeNull();
  });

  it("goes when an already-open document is asked for again", () => {
    two();
    useStore.getState().openScreen("library");
    useStore.getState().openDoc(makeDoc({ id: "b", path: "C:/b.md", text: "b" }));
    expect(useStore.getState().screen).toBeNull();
  });
});
