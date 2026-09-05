import { describe, expect, it } from "vitest";
import { crumbParts, pathKey } from "./paths";
import { makeDoc } from "./store";

describe("pathKey", () => {
  it("treats separator and case variants of one Windows path as one file", () => {
    expect(pathKey("C:\\notes\\On-Plain-Text.md")).toBe(pathKey("c:/notes/on-plain-text.md"));
  });

  it("ignores a trailing separator on a folder", () => {
    expect(pathKey("C:\\notes\\")).toBe(pathKey("C:/notes"));
  });

  it("keeps different files apart", () => {
    expect(pathKey("C:\\notes\\a.md")).not.toBe(pathKey("C:\\notes\\b.md"));
    expect(pathKey("C:\\notes\\a.md")).not.toBe(pathKey("C:\\other\\a.md"));
  });
});

describe("crumbParts", () => {
  const doc = (path: string) => makeDoc({ id: pathKey(path), path, text: "" });

  it("splits a deep path into a root, the folders between, and the file", () => {
    expect(crumbParts("C:\\lib", doc("C:\\lib\\проекты\\plain\\тз.md"))).toEqual({
      root: "lib",
      middle: ["проекты", "plain"],
      leaf: "тз.md",
    });
  });

  it("has no middle when the file sits in the root", () => {
    expect(crumbParts("C:\\lib", doc("C:\\lib\\a.md"))).toEqual({
      root: "lib",
      middle: [],
      leaf: "a.md",
    });
  });

  it("is the library alone when nothing is open", () => {
    expect(crumbParts("C:\\lib", null)).toEqual({ root: "lib", middle: [], leaf: null });
  });

  it("falls back to the last two parts for a file outside the library", () => {
    expect(crumbParts("C:\\lib", doc("D:\\elsewhere\\notes\\a.md"))).toEqual({
      root: "notes",
      middle: [],
      leaf: "a.md",
    });
  });

  it("says nothing when there is neither a library nor a document", () => {
    expect(crumbParts(null, null)).toBeNull();
  });
});
