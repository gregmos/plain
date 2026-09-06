import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileInfo } from "./fs";

const disk = vi.hoisted(() => ({ files: new Map<string, string>() }));

vi.mock("./fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fs")>();
  return {
    ...actual,
    readFile: async (path: string): Promise<FileInfo> => {
      const text = disk.files.get(path);
      if (text === undefined) {
        // What Rust hands back for a file that is not there on Windows.
        throw {
          kind: "io",
          message: "The system cannot find the path specified. (os error 3)",
        };
      }
      return {
        path,
        text,
        encoding: "utf-8",
        bom: false,
        eol: "lf",
        dominantEol: "lf",
        finalNewline: true,
        hash: "hash",
        mtimeMs: 0,
        size: text.length,
        readOnly: false,
        decodeErrors: false,
    hardLinks: 1,
      };
    },
  };
});

const { openPaths } = await import("./commands");
const { useStore } = await import("./store");

const HERE = "C:\\notes\\here.md";
const GONE = "C:\\notes\\gone.md";

beforeEach(() => {
  disk.files.clear();
  disk.files.set(HERE, "# here");
  useStore.setState({ docs: [], activeId: null, banner: null, recent: [GONE, HERE] });
});

describe("openPaths", () => {
  it("drops a recent entry whose file is gone (review #3)", async () => {
    await openPaths([GONE]);
    expect(useStore.getState().recent).toEqual([HERE]);
    expect(useStore.getState().banner?.id).toBe("open-failed");
  });

  it("keeps the entry when the failure is not a missing file", async () => {
    const fs = await import("./fs");
    const spy = vi
      .spyOn(fs, "readFile")
      .mockRejectedValue({ kind: "io", message: "Access is denied. (os error 5)" });
    await openPaths([GONE]);
    expect(useStore.getState().recent).toContain(GONE);
    expect(useStore.getState().banner?.id).toBe("open-failed");
    spy.mockRestore();
  });

  it("takes the complaint down once something does open (review #4)", async () => {
    await openPaths([GONE]);
    expect(useStore.getState().banner?.id).toBe("open-failed");

    await openPaths([HERE]);
    expect(useStore.getState().banner).toBeNull();
    expect(useStore.getState().docs).toHaveLength(1);
  });

  it("leaves the banner up when nothing opened at all", async () => {
    await openPaths([GONE, "C:\\notes\\also-gone.md"]);
    expect(useStore.getState().banner?.id).toBe("open-failed");
    expect(useStore.getState().docs).toHaveLength(0);
  });
});

describe("forgetRecent", () => {
  it("compares paths the way Windows does", () => {
    useStore.setState({ recent: ["C:\\Notes\\A.md", "C:\\notes\\b.md"] });
    useStore.getState().forgetRecent("c:/notes/a.md");
    expect(useStore.getState().recent).toEqual(["C:\\notes\\b.md"]);
  });

  it("leaves the list identical when there is nothing to drop", () => {
    const before = useStore.getState().recent;
    useStore.getState().forgetRecent("C:\\elsewhere.md");
    // Identity matters: the session only writes when something changed.
    expect(useStore.getState().recent).toBe(before);
  });
});
