import { beforeEach, describe, expect, it } from "vitest";
import { clearBuffers } from "../editor/buffers";
import {
  READING_LIMIT,
  loadSession,
  normalizeSession,
  parseSession,
  readingPosition,
  rememberReading,
  seedReading,
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
    await expect(loadSession()).resolves.toBeNull();
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

/**
 * A window made by `file → new window` is handed its session over IPC, so it
 * never sees the text state.json holds. The shaping has to be the one the
 * file gets, so what is written down here is what 0.2.3 produced — pinned,
 * not computed through `parseSession`, which now calls this very function
 * (W13 §2.2, §Т.1, M1).
 */
describe("normalizeSession", () => {
  /** Everything a session has, with two unusable entries mixed in. */
  it("shapes a valid session the way the file has always been shaped", () => {
    const shaped = normalizeSession({
      version: 1,
      files: [
        { path: "C:/notes/a.md", mode: "edit", caret: { line: 3, col: 7 } },
        { path: "C:/notes/b.md" },
        { mode: "edit" },
        null,
      ],
      active: "C:/notes/a.md",
      rail: { collapsed: true, view: "outline", width: 260 },
      split: 0.62,
      library: "C:/notes",
      collapsed: ["archive", 7],
      librarySort: "name",
      recent: ["C:/notes/a.md", 7],
      recentLibraries: ["C:/notes", "C:/a", "C:/b", "C:/c", "C:/d", "C:/e"],
      zoom: 1.25,
      reading: [
        ["c:/notes/a.md", "intro"],
        ["c:/notes/b.md", 7],
      ],
    });

    expect(shaped).toEqual({
      version: 1,
      files: [
        { path: "C:/notes/a.md", mode: "edit", caret: { line: 3, col: 7 } },
        { path: "C:/notes/b.md", mode: "read", caret: null },
      ],
      active: "C:/notes/a.md",
      rail: { collapsed: true, view: "outline", width: 260 },
      split: 0.62,
      library: "C:/notes",
      collapsed: ["archive"],
      librarySort: "name",
      recent: ["C:/notes/a.md"],
      // Five libraries, and the sixth is dropped.
      recentLibraries: ["C:/notes", "C:/a", "C:/b", "C:/c", "C:/d"],
      zoom: 1.25,
      reading: [["c:/notes/a.md", "intro"]],
    });
  });

  /** Every key the wrong type: the defaults, and not a thrown error. */
  it("falls back to the defaults, key by key, on a broken session", () => {
    const defaults = {
      version: 1,
      files: [],
      active: null,
      rail: { collapsed: false, view: "files", width: 232 },
      split: 0.5,
      library: null,
      collapsed: [],
      librarySort: "modified",
      recent: [],
      recentLibraries: [],
      zoom: 1,
      reading: [],
    };

    expect(
      normalizeSession({
        files: "not a list",
        active: 7,
        rail: 5,
        split: "wide",
        library: false,
        collapsed: "archive",
        librarySort: "size",
        recent: null,
        recentLibraries: 3,
        zoom: "big",
        reading: "nope",
      }),
    ).toEqual(defaults);
    expect(normalizeSession({})).toEqual(defaults);
    // Not an object at all is no session, which is not a bug either.
    expect(normalizeSession(null)).toBeNull();
  });

  it("carries the reading positions into the window it seeds", () => {
    const seeded = normalizeSession({ files: [], reading: [["c:/notes/seed.md", "top"]] });
    expect(seeded).not.toBeNull();
    seedReading(seeded as NonNullable<typeof seeded>);
    expect(readingPosition("C:/notes/seed.md")).toBe("top");
  });
});
