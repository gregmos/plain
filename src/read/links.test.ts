import { describe, expect, it } from "vitest";
import { isInside, joinPath, resolveHref, resolveWikiLink, shortPath } from "./links";

const DIR = "G:/Заметки/проекты";

describe("joinPath", () => {
  it("walks up and down", () => {
    expect(joinPath(DIR, "a.md")).toBe("G:/Заметки/проекты/a.md");
    expect(joinPath(DIR, "../a.md")).toBe("G:/Заметки/a.md");
    expect(joinPath(DIR, "./sub/../a.md")).toBe("G:/Заметки/проекты/a.md");
  });

  it("accepts backslashes on either side", () => {
    expect(joinPath("G:\\notes", "sub\\a.md")).toBe("G:/notes/sub/a.md");
  });
});

describe("resolveHref", () => {
  it("sends http, mailto and tel outside", () => {
    expect(resolveHref("https://example.com", DIR)).toEqual({
      kind: "external",
      url: "https://example.com",
    });
    expect(resolveHref("mailto:a@b.c", DIR).kind).toBe("external");
  });

  it("keeps a bare anchor in the document", () => {
    expect(resolveHref("#заголовок", DIR)).toEqual({ kind: "anchor", id: "заголовок" });
  });

  it("decodes %20 and Cyrillic escapes", () => {
    expect(resolveHref("./второй%20файл.md", DIR)).toEqual({
      kind: "file",
      path: "G:/Заметки/проекты/второй файл.md",
      hash: null,
    });
    expect(resolveHref("%D0%B7%D0%B0%D0%BC%D0%B5%D1%82%D0%BA%D0%B0.md", DIR)).toEqual({
      kind: "file",
      path: "G:/Заметки/проекты/заметка.md",
      hash: null,
    });
  });

  it("survives a stray percent sign", () => {
    expect(resolveHref("100%.md", DIR)).toEqual({
      kind: "file",
      path: "G:/Заметки/проекты/100%.md",
      hash: null,
    });
  });

  it("splits the fragment off a relative path", () => {
    expect(resolveHref("../а.md#Раздел%20два", DIR)).toEqual({
      kind: "file",
      path: "G:/Заметки/а.md",
      hash: "Раздел два",
    });
  });

  it("takes an absolute windows path as it is", () => {
    expect(resolveHref("D:\\docs\\a.md", DIR)).toEqual({
      kind: "file",
      path: "D:/docs/a.md",
      hash: null,
    });
  });

  it("has nowhere to go without a folder", () => {
    expect(resolveHref("a.md", null)).toEqual({ kind: "none" });
  });
});

describe("resolveWikiLink", () => {
  it("adds .md when the target has no extension", () => {
    expect(resolveWikiLink("заметка", null, DIR)).toEqual({
      kind: "file",
      path: "G:/Заметки/проекты/заметка.md",
      hash: null,
    });
  });

  it("keeps an explicit extension", () => {
    expect(resolveWikiLink("images/a.png", null, DIR)).toEqual({
      kind: "file",
      path: "G:/Заметки/проекты/images/a.png",
      hash: null,
    });
  });

  it("slugs the heading the way rehype-slug does", () => {
    expect(resolveWikiLink("note", "Some Heading", DIR)).toEqual({
      kind: "file",
      path: "G:/Заметки/проекты/note.md",
      hash: "some-heading",
    });
  });
});

describe("paths in the ui", () => {
  it("knows what lives in the library", () => {
    expect(isInside("G:/Заметки/проекты/a.md", "G:/Заметки")).toBe(true);
    expect(isInside("G:/другое/a.md", "G:/Заметки")).toBe(false);
    expect(isInside("g:\\заметки\\a.md", "G:/Заметки")).toBe(true);
  });

  it("shortens a path against the library", () => {
    expect(shortPath("G:/Заметки/проекты/a.md", "G:/Заметки")).toBe("проекты/a.md");
    expect(shortPath("D:/x/a.md", "G:/Заметки")).toBe("D:/x/a.md");
  });
});
