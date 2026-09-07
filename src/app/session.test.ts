import { beforeEach, describe, expect, it } from "vitest";
import { clearBuffers } from "../editor/buffers";
import {
  READING_LIMIT,
  loadState,
  parseSession,
  parseState,
  readingPosition,
  rememberReading,
  toSession,
} from "./session";
import { makeDoc, useStore } from "./store";

beforeEach(() => {
  clearBuffers();
  useStore.setState({ docs: [], activeId: null, recent: [], libraryPath: null, collapsed: [] });
});

describe("state.json", () => {
  it("round-trips what was open", () => {
    const store = useStore.getState();
    store.openDoc(makeDoc({ id: "c:/notes/a.md", path: "C:/notes/a.md", text: "a" }));
    store.openDoc(makeDoc({ id: "c:/notes/b.md", path: "C:/notes/b.md", text: "b", mode: "edit" }));
    useStore.getState().updateDoc("c:/notes/b.md", { caret: { line: 3, col: 7 } });
    useStore.getState().setLibraryPath("C:/notes");
    useStore.getState().setRailView("outline");
    rememberReading("C:/notes/a.md", "intro");

    const back = parseSession(JSON.stringify(toSession()));
    expect(back).not.toBeNull();
    expect(back?.files.map((f) => f.path)).toEqual(["C:/notes/a.md", "C:/notes/b.md"]);
    expect(back?.files[1]?.mode).toBe("edit");
    expect(back?.files[1]?.caret).toEqual({ line: 3, col: 7 });
    expect(back?.active).toBe("C:/notes/b.md");
    expect(back?.library).toBe("C:/notes");
    expect(back?.rail.view).toBe("outline");
    expect(back?.collapsed).toEqual([]);
    expect(back?.recent).toEqual(["C:/notes/b.md", "C:/notes/a.md"]);
    expect(back?.reading).toContainEqual(["c:/notes/a.md", "intro"]);
  });

  it("round-trips the zoom factor and the recent libraries", () => {
    const store = useStore.getState();
    store.setZoom(1.3);
    store.rememberLibrary("C:/notes");
    store.rememberLibrary("C:/work");

    const back = parseSession(JSON.stringify(toSession()));
    expect(back?.zoom).toBeCloseTo(1.3);
    expect(back?.recentLibraries).toEqual(["C:/work", "C:/notes"]);
  });

  it("keeps at most five libraries, newest first, without repeats", () => {
    const store = useStore.getState();
    for (const name of ["a", "b", "c", "d", "e", "f"]) store.rememberLibrary(`C:/${name}`);
    store.rememberLibrary("C:/c");
    expect(useStore.getState().recentLibraries).toEqual([
      "C:/c",
      "C:/f",
      "C:/e",
      "C:/d",
      "C:/b",
    ]);
  });

  it("refuses a zoom the view menu could never produce", () => {
    const base = JSON.parse(JSON.stringify(toSession()));
    expect(parseSession(JSON.stringify({ ...base, zoom: 12 }))?.zoom).toBe(1);
    expect(parseSession(JSON.stringify({ ...base, zoom: "big" }))?.zoom).toBe(1);
  });

  it("keeps the split width and the split mode", () => {
    const store = useStore.getState();
    store.openDoc(makeDoc({ id: "c:/notes/s.md", path: "C:/notes/s.md", text: "s", mode: "split" }));
    useStore.getState().setSplitRatio(0.62);

    const back = parseSession(JSON.stringify(toSession()));
    expect(back?.files[0]?.mode).toBe("split");
    expect(back?.split).toBeCloseTo(0.62);
  });

  it("refuses a width that would hide a panel", () => {
    expect(parseSession(JSON.stringify({ files: [], split: 0.02 }))?.split).toBe(0.5);
    expect(parseSession(JSON.stringify({ files: [], split: 1.4 }))?.split).toBe(0.5);
    expect(parseSession(JSON.stringify({ files: [] }))?.split).toBe(0.5);
  });

  it("remembers which folders of the tree were folded shut (spec §6)", () => {
    useStore.getState().setLibraryPath("C:/notes");
    useStore.getState().toggleCollapsed("archive");
    const back = parseSession(JSON.stringify(toSession()));
    expect(back?.collapsed).toEqual(["archive"]);
  });

  it("leaves the nameless buffer out — it has no path to reopen", () => {
    useStore.getState().openDoc(makeDoc({ id: "untitled-1", path: null, text: "" }));
    expect(toSession().files).toHaveLength(0);
    expect(toSession().active).toBeNull();
  });

  it("treats a broken file as no session at all", () => {
    expect(parseSession("not json")).toBeNull();
    expect(parseSession("[]")?.files).toEqual([]);
    expect(parseSession("{}")?.files).toEqual([]);
  });

  it("drops entries it cannot use instead of failing", () => {
    const back = parseSession(
      JSON.stringify({ files: [{ path: "C:/a.md" }, { mode: "edit" }, null], recent: ["C:/a.md", 7] }),
    );
    expect(back?.files).toEqual([{ path: "C:/a.md", mode: "read", caret: null }]);
    expect(back?.recent).toEqual(["C:/a.md"]);
  });

  it("does nothing outside Tauri", async () => {
    await expect(loadState()).resolves.toEqual([]);
  });
});

describe("state.json, one entry per window", () => {
  function slice(path: string): string {
    return JSON.stringify({ files: [{ path, mode: "read", caret: null }] });
  }

  it("reads every window back, in the order they were made", () => {
    const text = JSON.stringify({
      version: 2,
      windows: [JSON.parse(slice("C:/a.md")), JSON.parse(slice("C:/b.md"))],
    });
    const back = parseState(text);
    expect(back).toHaveLength(2);
    expect(back[0]?.files[0]?.path).toBe("C:/a.md");
    expect(back[1]?.files[0]?.path).toBe("C:/b.md");
  });

  /**
   * Version 1 was the single object one window wrote. Upgrading must not be
   * the moment somebody's open files disappear.
   */
  it("reads a version 1 file as the one window that wrote it", () => {
    const back = parseState(slice("C:/old.md"));
    expect(back).toHaveLength(1);
    expect(back[0]?.files[0]?.path).toBe("C:/old.md");
  });

  it("treats a broken file as no windows at all", () => {
    expect(parseState("not json")).toEqual([]);
    expect(parseState("null")).toEqual([]);
  });

  it("drops an entry it cannot use and keeps the rest", () => {
    const text = JSON.stringify({
      version: 2,
      windows: [null, JSON.parse(slice("C:/b.md")), 7],
    });
    const back = parseState(text);
    expect(back).toHaveLength(1);
    expect(back[0]?.files[0]?.path).toBe("C:/b.md");
  });

  /** A window that saved nothing is still a window, and comes back empty. */
  it("keeps a window with nothing open in it", () => {
    const text = JSON.stringify({ version: 2, windows: [{}] });
    expect(parseState(text)).toHaveLength(1);
    expect(parseState(text)[0]?.files).toEqual([]);
  });
});

describe("reading positions", () => {
  it("keeps the newest 300 and forgets the rest", () => {
    for (let index = 0; index < READING_LIMIT + 50; index += 1) {
      rememberReading(`C:/notes/${index}.md`, `h${index}`);
    }
    const kept = toSession().reading;
    expect(kept).toHaveLength(READING_LIMIT);
    expect(readingPosition("C:/notes/0.md")).toBeNull();
    expect(readingPosition("C:/notes/49.md")).toBeNull();
    expect(readingPosition("C:/notes/50.md")).toBe("h50");
    expect(readingPosition(`C:/notes/${READING_LIMIT + 49}.md`)).toBe(`h${READING_LIMIT + 49}`);
  });

  it("moves a file back to the front when it is read again", () => {
    rememberReading("C:/notes/old.md", "start");
    for (let index = 0; index < READING_LIMIT - 1; index += 1) {
      rememberReading(`C:/notes/f${index}.md`, "x");
    }
    rememberReading("C:/notes/old.md", "later");
    for (let index = 0; index < 10; index += 1) rememberReading(`C:/notes/g${index}.md`, "x");
    expect(readingPosition("C:/notes/old.md")).toBe("later");
  });

  it("finds a file whatever way the path is spelled", () => {
    rememberReading(String.raw`C:\Notes\Case.md`, "here");
    expect(readingPosition("c:/notes/case.md")).toBe("here");
  });
});
