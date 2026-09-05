import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type StateCommand } from "@codemirror/state";
import { indentUnit } from "@codemirror/language";
import { indentLess, indentMore } from "@codemirror/commands";
import {
  clearHeading,
  cycleList,
  detectIndent,
  insertLink,
  listKind,
  selectedLines,
  toggleBold,
  toggleCheckbox,
  toggleCodeBlock,
  toggleHeading,
  toggleItalic,
  toggleQuote,
  toggleStrike,
  urlPaste,
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

describe("strikethrough (the floating panel, spec §5.2)", () => {
  it("wraps the selection in ~~ and takes it back off", () => {
    expect(run(toggleStrike, "one «two» three")).toBe("one ~~«two»~~ three");
    expect(run(toggleStrike, "one «~~two~~» three")).toBe("one «two» three");
    expect(run(toggleStrike, "one ~~«two»~~ three")).toBe("one «two» three");
  });
});

describe("heading off (the menu, spec §4)", () => {
  it("takes any level off every selected line", () => {
    expect(run(clearHeading, "### one|")).toBe("one|");
    expect(run(clearHeading, "«# one\n###### two»")).toBe("«one\ntwo»");
  });
});


/** Same document, twice through the same command. */
function twice(command: StateCommand, input: string): string {
  const { doc, selection } = parse(input);
  let state = EditorState.create({ doc, selection });
  for (let i = 0; i < 2; i += 1) {
    const before = state;
    command({ state: before, dispatch: (tr) => (state = tr.state) });
  }
  return print(state);
}

describe("code block", () => {
  it("fences the line and takes the fences back off", () => {
    expect(run(toggleCodeBlock, "abc|")).toBe("```\nabc|\n```");
    expect(twice(toggleCodeBlock, "abc|")).toBe("abc|");
  });

  it("unwraps from inside the block", () => {
    expect(run(toggleCodeBlock, "```\nab|c\n```")).toBe("ab|c");
  });

  it("unwraps when the fences themselves are selected", () => {
    expect(run(toggleCodeBlock, "«```\nabc\n```»")).toBe("«abc»");
  });

  it("keeps the text around it", () => {
    expect(twice(toggleCodeBlock, "one\n«two»\nthree")).toBe("one\n«two»\nthree");
  });
});

describe("bold and italic together", () => {
  it("adds italic inside bold and takes it back off", () => {
    expect(run(toggleItalic, "**«abc»**")).toBe("***«abc»***");
    expect(run(toggleItalic, "***«abc»***")).toBe("**«abc»**");
    expect(twice(toggleItalic, "**«abc»**")).toBe("**«abc»**");
  });

  it("takes bold off text that is also italic", () => {
    expect(run(toggleBold, "***«abc»***")).toBe("*«abc»*");
  });

  it("round-trips bold over italic", () => {
    expect(twice(toggleBold, "*«abc»*")).toBe("*«abc»*");
  });
});

describe("selected lines", () => {
  it("stops at a selection that ends on a line boundary", () => {
    const state = EditorState.create({ doc: "one\ntwo", selection: EditorSelection.single(0, 4) });
    expect(selectedLines(state).map((l) => l.number)).toEqual([1]);
  });

  it("takes the second line when the selection reaches into it", () => {
    const state = EditorState.create({ doc: "one\ntwo", selection: EditorSelection.single(0, 5) });
    expect(selectedLines(state).map((l) => l.number)).toEqual([1, 2]);
  });

  it("does not carry a heading onto the next line", () => {
    expect(run(toggleHeading(1), "«one\n»two")).toBe("# «one\n»two");
  });
});

describe("read-only", () => {
  const commands: [string, StateCommand][] = [
    ["bold", toggleBold],
    ["link", insertLink],
    ["quote", toggleQuote],
    ["list", cycleList],
    ["checkbox", toggleCheckbox],
    ["heading", toggleHeading(1)],
    ["clear heading", clearHeading],
    ["code block", toggleCodeBlock],
    ["strike", toggleStrike],
  ];

  it.each(commands)("%s leaves a read-only document alone", (_name, command) => {
    const state = EditorState.create({
      doc: "one",
      selection: EditorSelection.single(0, 3),
      extensions: EditorState.readOnly.of(true),
    });
    let changed = false;
    expect(command({ state, dispatch: () => (changed = true) })).toBe(false);
    expect(changed).toBe(false);
  });
});

describe("pasting a url", () => {
  function paste(input: string, pasted: string, readOnly = false): string | null {
    const { doc, selection } = parse(input);
    const state = EditorState.create({
      doc,
      selection,
      extensions: readOnly ? EditorState.readOnly.of(true) : [],
    });
    const spec = urlPaste(state, pasted);
    return spec ? print(state.update(spec).state) : null;
  }

  it("makes a link out of the selection", () => {
    expect(paste("see «the docs» now", "https://example.com/a")).toBe(
      "see [the docs](https://example.com/a)| now",
    );
  });

  it("trims what came from the clipboard", () => {
    expect(paste("«x»", " https://example.com \n")).toBe("[x](https://example.com)|");
  });

  it("pastes as usual otherwise", () => {
    expect(paste("«x»", "not a url")).toBe(null);
    expect(paste("«x»", "https://a.example https://b.example")).toBe(null);
    expect(paste("x|", "https://example.com")).toBe(null);
    expect(paste("«x»", "https://example.com", true)).toBe(null);
  });
});
