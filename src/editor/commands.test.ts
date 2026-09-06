import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type StateCommand } from "@codemirror/state";
import { ensureSyntaxTree, indentUnit } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import type { EditorView } from "@codemirror/view";
import type { TransactionSpec } from "@codemirror/state";
import { indentLess, indentMore } from "@codemirror/commands";
import {
  CALLOUT_TYPES,
  clearHeading,
  cycleList,
  detectIndent,
  insertLink,
  listKind,
  selectedLines,
  toggleBold,
  insertFootnote,
  insertRule,
  insertTable,
  insertWikilink,
  nextFootnote,
  toggleBulletList,
  toggleCallout,
  toggleCheckbox,
  toggleCheckboxAt,
  toggleCodeBlock,
  toggleHighlight,
  toggleMathBlock,
  toggleMathInline,
  toggleOrderedList,
  toggleTaskList,
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

describe("ticking a box the parser found (review #7)", () => {
  function tick(doc: string, at = 0): string {
    const state = EditorState.create({
      doc,
      extensions: markdown({ base: markdownLanguage }),
    });
    ensureSyntaxTree(state, state.doc.length, 5000);
    let next = state;
    const view = {
      state,
      dispatch: (spec: TransactionSpec) => (next = state.update(spec).state),
    } as unknown as EditorView;
    expect(toggleCheckboxAt(view, at)).toBe(true);
    return next.doc.toString();
  }

  it("works wherever the item sits", () => {
    expect(tick("- [ ] task")).toBe("- [x] task");
    expect(tick("1. [ ] task")).toBe("1. [x] task");
    expect(tick("> - [ ] task")).toBe("> - [x] task");
    expect(tick("-  [ ] task")).toBe("-  [x] task");
    expect(tick("  - [x] done")).toBe("  - [ ] done");
  });

  it("takes the box the click landed on", () => {
    const doc = ["- [ ] one", "- [x] two"].join("\n");
    expect(tick(doc, doc.indexOf("[x]"))).toBe(["- [ ] one", "- [ ] two"].join("\n"));
  });

  it("says no when the line has no box", () => {
    const state = EditorState.create({ doc: "- plain item" });
    const view = { state, dispatch: () => undefined } as unknown as EditorView;
    expect(toggleCheckboxAt(view, 0)).toBe(false);
  });
});

describe("the v2.6 commands", () => {
  it("wraps and unwraps a highlight and inline math", () => {
    expect(run(toggleHighlight, "one «two» three")).toBe("one ==«two»== three");
    expect(run(toggleHighlight, "one ==«two»== three")).toBe("one «two» three");
    expect(run(toggleMathInline, "sum «x» here")).toBe("sum $«x»$ here");
    expect(run(toggleMathInline, "sum $«x»$ here")).toBe("sum «x» here");
    expect(run(toggleMathInline, "empty |")).toBe("empty $|$");
  });

  it("fences a block of math and takes it back off", () => {
    expect(twice(toggleMathBlock, "a = b|")).toBe("a = b|");
    expect(run(toggleMathBlock, "a = b|")).toBe("$$\na = b|\n$$");
  });

  it("puts a rule on a line of its own", () => {
    expect(run(insertRule, "|")).toBe("---\n|");
    // A blank line before it, or `text` would turn into a Setext heading.
    expect(run(insertRule, "text|")).toBe("text\n\n---\n|");
  });

  it("lays out a table with the caret on the first cell", () => {
    expect(run(insertTable, "|")).toBe("| |a | b | c |\n|---|---|---|\n|   |   |   |\n");
    // Not inside the list item: after it, at the top level (review #7).
    expect(run(insertTable, "- item|")).toBe(
      "- item\n\n| |a | b | c |\n|---|---|---|\n|   |   |   |\n",
    );
  });

  it("numbers a footnote and waits in the definition", () => {
    expect(nextFootnote("a [^1] b [^7] c")).toBe(8);
    expect(nextFootnote("nothing here")).toBe(1);
    expect(run(insertFootnote, "see|")).toBe("see[^1]\n\n[^1]: |");
  });

  it("wraps a wikilink", () => {
    expect(run(insertWikilink, "see «notes» now")).toBe("see [[«notes»]] now");
    expect(run(insertWikilink, "see |")).toBe("see [[|]]");
  });

  it("turns a paragraph into one kind of list, and back", () => {
    expect(run(toggleBulletList, "item|")).toBe("- item|");
    expect(run(toggleBulletList, "- item|")).toBe("item|");
    expect(run(toggleOrderedList, "item|")).toBe("1. item|");
    expect(run(toggleTaskList, "item|")).toBe("- [ ] item|");
    expect(run(toggleTaskList, "- [ ] item|")).toBe("item|");
  });

  it("quotes a callout under its type, and unquotes it", () => {
    expect(run(toggleCallout("note"), "careful|")).toBe("> [!NOTE]\n> careful|");
    // The same type again takes it off; another type only relabels it
    // (review #5).
    expect(run(toggleCallout("note"), "> [!NOTE]\n> careful|")).toBe("careful|");
    expect(run(toggleCallout("warning"), "> [!NOTE]\n> careful|")).toBe(
      "> [!WARNING]\n> careful|",
    );
    expect(twice(toggleCallout("tip"), "«one\ntwo»")).toBe("«one\ntwo»");
  });

  it("offers exactly the five types of the spec", () => {
    expect([...CALLOUT_TYPES]).toEqual(["note", "tip", "important", "warning", "caution"]);
  });
});

describe("what the review found (w12)", () => {
  it("leaves someone else's fenced block alone (#2)", () => {
    const state = EditorState.create({
      doc: ["```js", "x = 1|", "```"].join("\n"),
      selection: EditorSelection.single(9),
    });
    let touched = false;
    expect(toggleMathBlock({ state, dispatch: () => (touched = true) })).toBe(false);
    expect(touched).toBe(false);
  });

  it("unwraps only its own kind of fence (#2)", () => {
    expect(twice(toggleMathBlock, "a = b|")).toBe("a = b|");
    expect(twice(toggleCodeBlock, "print()|")).toBe("print()|");
  });

  it("keeps a footnote working with a selection (#1)", () => {
    // The selected words stay; the reference follows them.
    expect(run(insertFootnote, "see «this» now")).toBe("see this[^1] now\n\n[^1]: |");
  });

  it("does not rewrite the markers of other lines (#4)", () => {
    expect(run(toggleBulletList, "«plain\n1. numbered»")).toBe("- «plain\n1. numbered»");
    expect(run(toggleBulletList, "|")).toBe("- |");
  });

  it("takes a wikilink back off (#6)", () => {
    expect(twice(insertWikilink, "«word»")).toBe("«word»");
    expect(run(insertWikilink, "[[«word»]]")).toBe("«word»");
  });

  it("counts footnotes outside code only (#8)", () => {
    expect(nextFootnote("`[^900]` and [^2]")).toBe(3);
    expect(nextFootnote("```\n[^900]\n``` [^1]")).toBe(2);
    expect(nextFootnote(String.raw`\[^900] alone`)).toBe(1);
  });

  it("will not highlight inside code or a link target (#11)", () => {
    const inCode = EditorState.create({
      doc: "`a b`",
      selection: EditorSelection.single(1, 4),
      extensions: markdown({ base: markdownLanguage }),
    });
    ensureSyntaxTree(inCode, inCode.doc.length, 5000);
    expect(toggleHighlight({ state: inCode, dispatch: () => undefined })).toBe(false);
  });
});
