import { describe, expect, it } from "vitest";
import { filesOf, showsTags } from "./tags";

/**
 * Spec §2a: the rail's `tags` section appears only when the setting is on
 * and the library actually has tags. A heading over an empty list says
 * nothing, and someone who does not use tags should not see the section.
 */
describe("showsTags", () => {
  it("shows the section when tags are on and there are some", () => {
    expect(showsTags(true, 3)).toBe(true);
  });

  it("hides it when the library has none", () => {
    expect(showsTags(true, 0)).toBe(false);
  });

  it("hides it when the setting is off, however many there are", () => {
    expect(showsTags(false, 3)).toBe(false);
  });

  it("hides it when the setting is off and there are none", () => {
    expect(showsTags(false, 0)).toBe(false);
  });
});

describe("filesOf", () => {
  const tags = [
    { tag: "writing", count: 2, files: ["a.md", "b.md"], truncated: false },
    { tag: "tools", count: 0, files: [], truncated: false },
  ];

  it("gives the files of the tag that is on", () => {
    expect(filesOf(tags, "writing")).toEqual(["a.md", "b.md"]);
  });

  it("means everything when no tag is chosen", () => {
    expect(filesOf(tags, null)).toBeNull();
  });

  it("means nothing for a tag nobody has", () => {
    expect(filesOf(tags, "unknown")).toEqual([]);
  });
});
