import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type StateCommand } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { indentLess, indentMore } from "@codemirror/commands";
import {
  cycleList,
  detectIndent,
  insertLink,
  listKind,
  toggleBold,
  toggleCheckbox,
  toggleHeading,
  toggleItalic,
  toggleQuote,
} from "./commands";

/** Runs a command over a document; `|` marks the caret, `«»` the selection. */
function run(command: StateCommand, input: string, unit = "  "): string {
  const { doc, selection } = parse(input);
  const state = EditorState.create({ doc, selection, extensions: indentUnit.of(unit) });
  let next = state;
  const ran = command({ state, dispatch: (tr) => (next = tr.state) });
  expect(ran).toBe(true);
  return print(next);
}

function parse(input: string): { doc: string; selection: EditorSelection } {
  const start = input.indexOf("«");
  if (start >= 0) {
    const end = input.indexOf("»") - 1;
    return {
      doc: input.replace("«", "").replace("»", ""),
      selection: EditorSelection.single(start, end),
    };
  }
  const caret = input.indexOf("|");
  return {
    doc: input.replace("|", ""),
    selection: EditorSelection.single(caret < 0 ? 0 : caret),
  };
}

function print(state: EditorState): string {
  const { from, to } = state.selection.main;
  const text = state.doc.toString();
  return from === to
    ? text.slice(0, from) + "|" + text.slice(from)
    : text.slice(0, from) + "«" + text.slice(from, to) + "»" + text.slice(to);
}

describe("inline marks", () => {
  it("wraps the selection and puts the marks back off", () => {
    expect(run(toggleBold, "one «two» three")).toBe("one **«two»** three");
    expect(run(toggleBold, "one «**two**» three")).toBe("one «two» three");
  });

  it("removes marks that sit just outside the selection", () => {
    expect(run(toggleBold, "one **«two»** three")).toBe("one «two» three");
  });

  it("leaves a caret between fresh marks", () => {
    expect(run(toggleBold, "one |")).toBe("one **|**");
  });

  it("does not mistake half of ** for italic", () => {
    expect(run(toggleItalic, "one **«two»** three")).toBe("one ***«two»*** three");
  });
});

describe("headings", () => {
  it("adds and removes the same level", () => {
    expect(run(toggleHeading(1), "title|")).toBe("# title|");
    expect(run(toggleHeading(1), "# title|")).toBe("title|");
  });

  it("replaces another level", () => {
    expect(run(toggleHeading(2), "# title|")).toBe("## title|");
  });
});

describe("lists", () => {
  it("cycles - -> 1. -> - [ ] -> off", () => {
    expect(run(cycleList, "item|")).toBe("- item|");
    expect(run(cycleList, "- item|")).toBe("1. item|");
    expect(run(cycleList, "1. item|")).toBe("- [ ] item|");
    expect(run(cycleList, "- [ ] item|")).toBe("item|");
  });

  it("numbers a whole selection", () => {
    expect(run(cycleList, "- «one\n- two\n- three»")).toBe("1. «one\n2. two\n3. three»");
  });

  it("reads the kind of a line", () => {
    expect(listKind("  - [x] done")).toBe("task");
    expect(listKind("  2) later")).toBe("ordered");
    expect(listKind("plain")).toBe("none");
  });
});

describe("checkboxes", () => {
  it("ticks, unticks and creates", () => {
    expect(run(toggleCheckbox, "- [ ] task|")).toBe("- [x] task|");
    expect(run(toggleCheckbox, "- [x] task|")).toBe("- [ ] task|");
    expect(run(toggleCheckbox, "- task|")).toBe("- [ ] task|");
    expect(run(toggleCheckbox, "task|")).toBe("- [ ] task|");
  });
});

describe("quote", () => {
  it("toggles the whole selection", () => {
    expect(run(toggleQuote, "«one\ntwo»")).toBe("> «one\n> two»");
    expect(run(toggleQuote, "> «one\n> two»")).toBe("«one\ntwo»");
  });
});

describe("link", () => {
  it("wraps the selection and waits in the url", () => {
    expect(run(insertLink, "see «the docs» now")).toBe("see [the docs](|) now");
  });
});

describe("indent", () => {
  it("moves a line by one unit", () => {
    expect(run(indentMore, "- item|")).toBe("  - item|");
    expect(run(indentLess, "  - item|")).toBe("- item|");
  });

  it("uses the indent of the file over the setting", () => {
    expect(detectIndent("- one\n    - two\n", "  ")).toBe("    ");
    expect(detectIndent("- one\n\t- two\n", "  ")).toBe("\t");
    expect(detectIndent("no indent here\n", "  ")).toBe("  ");
  });
});
