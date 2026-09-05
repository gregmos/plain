import { describe, expect, it } from "vitest";
import { imageMarkdown, isImagePath, stampName, uniqueName } from "./images";

describe("the name a pasted image gets", () => {
  it("is the moment it was pasted", () => {
    expect(stampName(new Date(2026, 8, 5, 18, 42, 33))).toBe("2026-09-05-184233.png");
    expect(stampName(new Date(2026, 0, 1, 0, 0, 0))).toBe("2026-01-01-000000.png");
  });

  it("steps aside when the name is taken", () => {
    const taken = new Set(["a.png", "a-2.png", "a-3.png"]);
    expect(uniqueName("free.png", (n) => taken.has(n))).toBe("free.png");
    expect(uniqueName("a.png", (n) => taken.has(n))).toBe("a-4.png");
  });

  it("keeps the extension where it belongs", () => {
    const taken = new Set(["photo.jpeg", "notes"]);
    expect(uniqueName("photo.jpeg", (n) => taken.has(n))).toBe("photo-2.jpeg");
    expect(uniqueName("notes", (n) => taken.has(n))).toBe("notes-2");
    expect(uniqueName(".hidden", (n) => taken.has(n))).toBe(".hidden");
  });
});

describe("what lands in the document", () => {
  it("is a relative link into assets", () => {
    expect(imageMarkdown("2026-09-05-184233.png")).toBe("![](assets/2026-09-05-184233.png)");
    expect(imageMarkdown("шапка.png")).toBe("![](assets/шапка.png)");
  });
});

describe("which drops count as images", () => {
  it("goes by the extension, either slash, any case", () => {
    expect(isImagePath("C:/notes/a.PNG")).toBe(true);
    expect(isImagePath("C:\\notes\\a.jpeg")).toBe(true);
    expect(isImagePath("C:\\notes\\a.webp")).toBe(true);
    expect(isImagePath("C:\\notes\\note.md")).toBe(false);
    expect(isImagePath("C:\\notes\\png")).toBe(false);
  });
});
