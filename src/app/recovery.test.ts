// Two ways the decode warning used to be lost on the way to a write
// (review #1 and #2). Both end the same way: bytes the encoding could not
// read get replaced by `\uFFFD` on disk without anyone being asked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const readTextFile = vi.fn<(path: string) => Promise<string>>();
const readFile = vi.fn();
const saveDialog = vi.fn<() => Promise<string | null>>();
const writeFileAtomic = vi.fn();

vi.mock("./env", () => ({ inTauri: true }));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async () => false),
  readDir: vi.fn(async () => []),
  readTextFile: (path: string) => readTextFile(path),
  remove: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: () => saveDialog() }));

vi.mock("./fs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./fs")>()),
  readFile: (path: string, encoding?: string) => readFile(path, encoding),
  writeFileAtomic: (request: unknown) => writeFileAtomic(request),
  canonicalPath: async (path: string) => path,
  trashPath: vi.fn(async () => undefined),
  writeTextAtomic: vi.fn(async () => undefined),
}));

const { restoreDraft } = await import("./drafts");
const { save, saveAs } = await import("./save");
const { buffer, clearBuffers } = await import("../editor/buffers");
const { DEFAULTS } = await import("./settings");
const { makeDoc, useStore } = await import("./store");
const { EditorState } = await import("@codemirror/state");

const PATH = "C:/notes/broken.md";
const ID = "c:/notes/broken.md";

function fileInfo(over: Partial<Record<string, unknown>> = {}) {
  return {
    path: PATH,
    text: "on disk\n",
    encoding: "utf-16le",
    bom: true,
    eol: "lf",
    dominantEol: "lf",
    finalNewline: true,
    hash: "diskhash",
    mtimeMs: 0,
    size: 8,
    readOnly: false,
    decodeErrors: false,
    ...over,
  };
}

function draft(over: Partial<Record<string, unknown>> = {}) {
  return JSON.stringify({
    text: "edited\n",
    path: PATH,
    id: ID,
    title: "broken.md",
    baseHash: "diskhash",
    encoding: "utf-16le",
    bom: true,
    eol: "lf",
    finalNewline: true,
    decodeErrors: false,
    caret: null,
    savedAt: Date.now(),
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearBuffers();
  useStore.setState({ docs: [], activeId: null, dialog: null, banner: null });
});

/* ------------------------------------------------------------ review #1 */

describe("a restored draft remembers what could not be decoded", () => {
  it("brings the flag back with the text", async () => {
    readTextFile.mockResolvedValue(draft({ decodeErrors: true }));
    readFile.mockResolvedValue(fileInfo({ decodeErrors: true }));

    const outcome = await restoreDraft({ file: "d.json", path: PATH, title: "broken.md", savedAt: 0 });
    expect(outcome?.id).toBe(ID);
    expect(useStore.getState().docs[0]?.decodeErrors).toBe(true);
  });

  // A draft written before the flag existed still has the file to ask.
  it("asks the file when the draft is older than the flag", async () => {
    readTextFile.mockResolvedValue(draft({ decodeErrors: undefined }));
    readFile.mockResolvedValue(fileInfo({ decodeErrors: true }));

    await restoreDraft({ file: "d.json", path: PATH, title: "broken.md", savedAt: 0 });
    expect(useStore.getState().docs[0]?.decodeErrors).toBe(true);
  });

  it("leaves a sound document alone", async () => {
    readTextFile.mockResolvedValue(draft());
    readFile.mockResolvedValue(fileInfo());

    await restoreDraft({ file: "d.json", path: PATH, title: "broken.md", savedAt: 0 });
    expect(useStore.getState().docs[0]?.decodeErrors).toBe(false);
  });

  // `reopen as…` may have forced an encoding detection would not pick; the
  // saved text and the warning both belong to that reading of the file.
  it("re-reads the file the way the buffer was reading it", async () => {
    readTextFile.mockResolvedValue(draft({ encoding: "windows-1251" }));
    readFile.mockResolvedValue(fileInfo({ encoding: "windows-1251" }));

    await restoreDraft({ file: "d.json", path: PATH, title: "broken.md", savedAt: 0 });
    expect(readFile).toHaveBeenCalledWith(PATH, "windows-1251");
  });

  it("stops a save until the question is answered", async () => {
    readTextFile.mockResolvedValue(draft({ decodeErrors: true }));
    readFile.mockResolvedValue(fileInfo({ decodeErrors: true }));
    await restoreDraft({ file: "d.json", path: PATH, title: "broken.md", savedAt: 0 });

    expect(await save(ID)).toBe(false);
    expect(writeFileAtomic).not.toHaveBeenCalled();
    expect(useStore.getState().dialog?.title).toBe("text had undecodable bytes");
  });
});

/* ------------------------------------------------------------ review #2 */

describe("save as onto the file it already has", () => {
  const open = (over: Partial<Record<string, unknown>> = {}) => {
    const doc = makeDoc({
      id: ID,
      path: PATH,
      text: "edited\n",
      savedText: "on disk\n",
      dirty: true,
      baseHash: "diskhash",
      encoding: "utf-8",
      ...over,
    });
    useStore.setState({ docs: [doc], activeId: doc.id });
    return doc;
  };

  it("asks about undecodable bytes instead of overwriting the original", async () => {
    open({ decodeErrors: true });
    saveDialog.mockResolvedValue(PATH);

    expect(await saveAs(ID)).toBe(false);
    expect(writeFileAtomic).not.toHaveBeenCalled();
    expect(useStore.getState().dialog?.title).toBe("text had undecodable bytes");
  });

  it("asks about a legacy encoding instead of converting it silently", async () => {
    open({ encoding: "windows-1251" });
    saveDialog.mockResolvedValue(PATH);

    expect(await saveAs(ID)).toBe(false);
    expect(writeFileAtomic).not.toHaveBeenCalled();
    expect(useStore.getState().dialog?.title).toContain("is not utf-8");
  });

  // The whole point: the same file means the base hash is checked, so an
  // external change is still a conflict rather than an overwrite.
  it("writes with the base hash, not without one", async () => {
    open();
    saveDialog.mockResolvedValue(PATH);
    writeFileAtomic.mockResolvedValue("newhash");

    expect(await saveAs(ID)).toBe(true);
    expect(writeFileAtomic).toHaveBeenCalledTimes(1);
    expect(writeFileAtomic.mock.calls[0]?.[0]).toMatchObject({
      path: PATH,
      baseHash: "diskhash",
      allowMissing: false,
    });
  });

  // The copy of a read-only file is editable, and the EditorState that came
  // with the buffer has to hear about it (review w67 #5).
  it("hands the copy of a read-only file an editable buffer", async () => {
    const doc = open({ readOnly: true });
    // The buffer exists before the save, holding `readOnly.of(true)`.
    const opened = buffer(doc, DEFAULTS);
    expect(opened.state.facet(EditorState.readOnly)).toBe(true);

    saveDialog.mockResolvedValue("C:/notes/copy.md");
    writeFileAtomic.mockResolvedValue({ hash: "newhash", snapshotError: null });
    expect(await saveAs(ID)).toBe(true);

    const copy = useStore.getState().docs[0];
    expect(copy?.readOnly).toBe(false);
    const moved = buffer(copy!, DEFAULTS);
    expect(moved.state.facet(EditorState.readOnly)).toBe(false);
  });

  it("a different name is still a copy, written without a base hash", async () => {
    open();
    saveDialog.mockResolvedValue("C:/notes/copy.md");
    writeFileAtomic.mockResolvedValue("newhash");

    expect(await saveAs(ID)).toBe(true);
    expect(writeFileAtomic.mock.calls[0]?.[0]).toMatchObject({
      path: "C:/notes/copy.md",
      baseHash: null,
      allowMissing: true,
    });
  });

  it("warns before copying a document that did not decode cleanly", async () => {
    open({ decodeErrors: true });
    saveDialog.mockResolvedValue("C:/notes/copy.md");

    expect(await saveAs(ID)).toBe(false);
    expect(saveDialog).not.toHaveBeenCalled();
    expect(writeFileAtomic).not.toHaveBeenCalled();
    expect(useStore.getState().dialog?.title).toBe("text had undecodable bytes");
  });
});
