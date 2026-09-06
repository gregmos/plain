import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { DEFAULTS } from "../app/settings";
import { makeDoc } from "../app/store";
import { replaceFocus } from "./findPanel";
import { PLACEHOLDER, editorExtensions, placeholderHint } from "./setup";

describe("where Ctrl+H puts the caret (UX #6)", () => {
  it("starts in find while there is nothing to search for", () => {
    expect(replaceFocus("")).toBe("find");
    expect(replaceFocus("   ")).toBe("find");
  });

  it("goes straight to replace once a query is there", () => {
    expect(replaceFocus("needle")).toBe("replace");
    expect(replaceFocus(" x ")).toBe("replace");
  });
});

describe("the empty document (UX #25)", () => {
  it("carries the placeholder from the mockup", () => {
    const doc = makeDoc({ id: "c:/x/new.md", path: "C:/x/new.md", text: "" });
    const extensions = editorExtensions(doc, DEFAULTS);
    // `placeholder()` is itself a small bundle; every piece has to be there.
    const flat = (extensions as unknown[]).flat(9);
    for (const part of [placeholderHint].flat(9)) expect(flat).toContain(part);
    expect(PLACEHOLDER).toBe("type here, or just keep writing.");
    // And it is a real editor state, not just an array that happens to match.
    expect(EditorState.create({ doc: "", extensions }).doc.length).toBe(0);
  });
});
