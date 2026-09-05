// Enter continuation comes from @codemirror/lang-markdown; these tests are
// here to prove the wiring (GFM base, markdown keymap) actually does it.

import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  insertNewlineContinueMarkupCommand,
  markdown,
  markdownLanguage,
} from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";

// Same configuration the editor binds to Enter (see setup.ts).
const continueMarkup = insertNewlineContinueMarkupCommand({ nonTightLists: false });

function press(input: string): string {
  const caret = input.indexOf("|");
  const state = EditorState.create({
    doc: input.replace("|", ""),
    selection: EditorSelection.single(caret),
    extensions: markdown({ base: markdownLanguage }),
  });
  // The command needs a parsed tree, which a headless state parses lazily.
  ensureSyntaxTree(state, state.doc.length, 5000);
  let next = state;
  continueMarkup({ state, dispatch: (tr) => (next = tr.state) });
  const text = next.doc.toString();
  const head = next.selection.main.head;
  return text.slice(0, head) + "|" + text.slice(head);
}

describe("enter continues the markup", () => {
  it("keeps a bullet", () => {
    expect(press("- one|")).toBe("- one\n- |");
  });

  it("counts an ordered list on", () => {
    expect(press("1. one|")).toBe("1. one\n2. |");
  });

  it("keeps a checkbox, unticked", () => {
    expect(press("- [x] done|")).toBe("- [x] done\n- [ ] |");
  });

  it("keeps a quote", () => {
    expect(press("> quoted|")).toBe("> quoted\n> |");
  });

  it("drops the level on an empty item", () => {
    expect(press("- one\n  - |")).toBe("- one\n- |");
  });

  it("leaves the list on an empty top-level item", () => {
    expect(press("- one\n- |")).toBe("- one\n|");
  });
});
