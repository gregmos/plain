// A renamed file keeps what is filed beside it: its recovery draft and its
// version history are both named after the path (review w10 #2).

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();
const files = new Map<string, string>();

vi.mock("./env", () => ({ inTauri: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a?: unknown) => invoke(c, a) }));
vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: async () => "/data",
  join: async (...parts: string[]) => parts.join("/"),
}));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: async (path: string) => files.has(path),
  readDir: async () => [],
  readTextFile: async (path: string) => {
    const text = files.get(path);
    if (text === undefined) throw new Error("no such file");
    return text;
  },
  remove: async (path: string) => {
    files.delete(path);
  },
}));
vi.mock("./fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fs")>()),
  writeTextAtomic: async (path: string, text: string) => {
    files.set(path, text);
  },
}));

const { documentKey, moveDraft } = await import("./drafts");
const { migrateDocument, moveHistory } = await import("./history");

const OLD = "C:/notes/old name.md";
const NEW = "C:/notes/new name.md";
const from = { id: "c:/notes/old name.md", path: OLD };
const to = { id: "c:/notes/new name.md", path: NEW };

const draftFile = (doc: { id: string; path: string | null }) =>
  `/data/drafts/${documentKey(doc)}.json`;

/** `dataDir()` asks Rust where our folder is; everything else here is the
 *  history rename. */
function answerCommands(also?: (command: string) => void) {
  invoke.mockImplementation(async (command) => {
    also?.(command);
    return command === "data_path" ? "/data" : true;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  files.clear();
  answerCommands();
});

describe("a renamed document takes its draft along", () => {
  it("writes it under the new name and removes the old one", async () => {
    files.set(draftFile(from), '{"text":"unsaved\n"}');

    expect(await moveDraft(from, to)).toBe(true);
    expect(files.get(draftFile(to))).toBe('{"text":"unsaved\n"}');
    expect(files.has(draftFile(from))).toBe(false);
  });

  // The whole point: the old name must not come back at the next start.
  it("leaves nothing behind for recovery to find", async () => {
    files.set(draftFile(from), '{"text":"unsaved\n"}');
    await moveDraft(from, to);
    expect([...files.keys()]).toEqual([draftFile(to)]);
  });

  it("does nothing when there was no draft", async () => {
    expect(await moveDraft(from, to)).toBe(false);
    expect(files.size).toBe(0);
  });

  // Better the old name than neither: the text is still somewhere.
  it("keeps the old draft when the new one cannot be written", async () => {
    files.set(draftFile(from), '{"text":"unsaved\n"}');
    const fs = await import("./fs");
    vi.spyOn(fs, "writeTextAtomic").mockRejectedValueOnce(new Error("disk full"));

    expect(await moveDraft(from, to)).toBe(false);
    expect(files.has(draftFile(from))).toBe(true);
  });

  it("is a no-op when the path did not really change", async () => {
    files.set(draftFile(from), "{}");
    // The same file, spelled the Windows way: `pathKey` settles that.
    const same = { id: from.id, path: String.raw`C:\notes\old name.md` };
    expect(await moveDraft(from, same)).toBe(false);
    expect(files.has(draftFile(from))).toBe(true);
  });
});

describe("a renamed document takes its versions along", () => {
  it("asks Rust to rename the folder, by key rather than by path", async () => {
    expect(await moveHistory(from, to)).toBe(true);
    expect(invoke).toHaveBeenCalledWith("rename_history", {
      oldId: documentKey(from),
      newId: documentKey(to),
    });
  });

  it("does not ask when the key is the same", async () => {
    expect(await moveHistory(from, from)).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("survives a folder that was not there", async () => {
    invoke.mockImplementation(async (command) => (command === "data_path" ? "/data" : false));
    expect(await moveHistory(from, to)).toBe(false);
  });
});

describe("migrateDocument", () => {
  it("moves the versions first, then the draft", async () => {
    files.set(draftFile(from), "{}");
    const order: string[] = [];
    answerCommands((command) => {
      if (command !== "data_path") order.push(command);
    });
    const fs = await import("./fs");
    vi.spyOn(fs, "writeTextAtomic").mockImplementation(async (path, text) => {
      order.push("draft");
      files.set(path, text);
    });

    await migrateDocument(OLD, NEW);
    expect(order).toEqual(["rename_history", "draft"]);
    expect(files.has(draftFile(to))).toBe(true);
    expect(files.has(draftFile(from))).toBe(false);
  });
});
