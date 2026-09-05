import { describe, expect, it } from "vitest";
import { pathKey } from "./paths";

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
