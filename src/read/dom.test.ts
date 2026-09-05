import { describe, expect, it } from "vitest";
import { imagePath, needsRecheck } from "./dom";

// Review #11: a wikilink was checked once and kept its answer forever, so a
// note created afterwards stayed muted and dead. The stamp is the library
// revision the answer was given under.
describe("needsRecheck", () => {
  it("checks a link that has never been checked", () => {
    expect(needsRecheck(undefined, 0)).toBe(true);
    expect(needsRecheck(undefined, 7)).toBe(true);
  });

  it("leaves a link that was checked against the library as it is now", () => {
    expect(needsRecheck("0", 0)).toBe(false);
    expect(needsRecheck("7", 7)).toBe(false);
  });

  it("checks again once the library has moved", () => {
    expect(needsRecheck("0", 1)).toBe(true);
    expect(needsRecheck("7", 8)).toBe(true);
  });

  // The old `data-checked="1"` marked "checked, never again".
  it("does not mistake the old marker for a current answer", () => {
    expect(needsRecheck("1", 0)).toBe(true);
    expect(needsRecheck("1", 2)).toBe(true);
  });
});

describe("imagePath", () => {
  it("resolves against the document's folder", () => {
    expect(imagePath("assets/схема.png", "G:/Заметки")).toBe("G:/Заметки/assets/схема.png");
    expect(imagePath("../images/x.png", "G:/Заметки/проекты")).toBe("G:/Заметки/images/x.png");
  });

  it("decodes what a markdown link escaped", () => {
    expect(imagePath("./второй%20файл.png", "G:/З")).toBe("G:/З/второй файл.png");
  });

  it("keeps an absolute path", () => {
    expect(imagePath("D:\\pics\\a.png", "G:/З")).toBe("D:/pics/a.png");
  });

  it("has nowhere to resolve without a folder", () => {
    expect(imagePath("a.png", null)).toBeNull();
  });
});
