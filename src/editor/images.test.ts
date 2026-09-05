import { describe, expect, it } from "vitest";
import {
  imageMarkdown,
  isImagePath,
  landing,
  queueAssetWork,
  stampName,
  uniqueName,
} from "./images";

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

describe("what the link looks like (review #8)", () => {
  it("percent-encodes only what would break the link", () => {
    expect(imageMarkdown("my photo.png")).toBe("![](assets/my%20photo.png)");
    expect(imageMarkdown("shot (2).png")).toBe("![](assets/shot%20%282%29.png)");
    expect(imageMarkdown("<a>.png")).toBe("![](assets/%3Ca%3E.png)");
    // Anything a path may hold and markdown does not mind stays readable.
    expect(imageMarkdown("схема-1_v2.png")).toBe("![](assets/схема-1_v2.png)");
  });
});

describe("where a finished image goes (review #3)", () => {
  it("into the document it was pasted into, and nowhere else", () => {
    expect(landing("c:/notes/a.md", "c:/notes/a.md")).toBe("insert");
    expect(landing("c:/notes/b.md", "c:/notes/a.md")).toBe("message");
    // Nothing is on screen: the file is written, the text is left alone.
    expect(landing(null, "c:/notes/a.md")).toBe("message");
  });
});

describe("two images at once (review #7)", () => {
  it("never picks the same name twice", async () => {
    const disk = new Set<string>();
    // Read-then-write with a gap, which is what the file system does.
    const save = () =>
      queueAssetWork(async () => {
        const name = uniqueName("shot.png", (candidate) => disk.has(candidate));
        await new Promise((resolve) => setTimeout(resolve, 5));
        disk.add(name);
        return name;
      });

    const names = await Promise.all([save(), save(), save()]);
    expect(new Set(names).size).toBe(3);
    expect(names).toEqual(["shot.png", "shot-2.png", "shot-3.png"]);
  });

  it("keeps going after one of them fails", async () => {
    const failed = queueAssetWork(async () => {
      throw new Error("no room");
    });
    await expect(failed).rejects.toThrow("no room");
    await expect(queueAssetWork(async () => "fine")).resolves.toBe("fine");
  });
});
