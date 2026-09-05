import { describe, expect, it } from "vitest";
import { nameError, splitName, uniqueName, withExtension } from "./names";

describe("uniqueName", () => {
  it("keeps the wanted name when the folder is empty", () => {
    expect(uniqueName("Untitled.md", [])).toBe("Untitled.md");
  });

  it("counts up past every name that is taken (spec §6)", () => {
    expect(uniqueName("Untitled.md", ["Untitled.md"])).toBe("Untitled 2.md");
    expect(uniqueName("Untitled.md", ["Untitled.md", "Untitled 2.md"])).toBe("Untitled 3.md");
    expect(uniqueName("Untitled.md", ["Untitled.md", "Untitled 3.md"])).toBe("Untitled 2.md");
  });

  it("compares the way Windows does, without case", () => {
    expect(uniqueName("Untitled.md", ["untitled.MD"])).toBe("Untitled 2.md");
  });

  it("numbers a folder, which has no suffix to keep", () => {
    expect(uniqueName("New folder", ["New folder"])).toBe("New folder 2");
  });
});

describe("splitName", () => {
  it("keeps a dotfile whole", () => {
    expect(splitName(".gitignore")).toEqual({ stem: ".gitignore", suffix: "" });
  });

  it("takes only the last extension", () => {
    expect(splitName("notes.tar.md")).toEqual({ stem: "notes.tar", suffix: ".md" });
  });
});

describe("withExtension", () => {
  it("adds the library extension to a bare name", () => {
    expect(withExtension("ideas", ".md")).toBe("ideas.md");
  });

  it("leaves a name that already has one alone", () => {
    expect(withExtension("ideas.markdown", ".md")).toBe("ideas.markdown");
  });
});

describe("nameError", () => {
  it("accepts an ordinary name", () => {
    expect(nameError("weekly review.md")).toBeNull();
  });

  it("refuses what Windows refuses", () => {
    expect(nameError("")).not.toBeNull();
    expect(nameError("a/b.md")).not.toBeNull();
    expect(nameError("a?.md")).not.toBeNull();
    expect(nameError("trailing.")).not.toBeNull();
  });

  it("trims the spaces around a name instead of refusing it", () => {
    expect(nameError("  ideas.md  ")).toBeNull();
  });
});
