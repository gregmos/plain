import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { richRanges, type RichRange } from "./rich";

function stateOf(doc: string): EditorState {
  const state = EditorState.create({
    doc,
    extensions: markdown({ base: markdownLanguage }),
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

/** `kind(text)` for every range, in document order. */
function ranges(doc: string, caretLine = 0): string[] {
  const state = stateOf(doc);
  const active = caretLine > 0 ? new Set([caretLine]) : new Set<number>();
  const out = richRanges(state, 0, state.doc.length, active);
  return out
    .slice()
    .sort((a: RichRange, b: RichRange) => a.from - b.from || a.to - b.to)
    .map((r) => `${r.kind}(${JSON.stringify(state.sliceDoc(r.from, r.to))})`);
}

describe("what rich hides", () => {
  it("takes the marks off bold, italic, code and strike", () => {
    expect(ranges("**bold**")).toEqual(['hide("**")', 'hide("**")']);
    expect(ranges("*it*")).toEqual(['hide("*")', 'hide("*")']);
    expect(ranges("`code`")).toEqual(['hide("`")', 'hide("`")']);
    expect(ranges("~~out~~")).toEqual(['hide("~~")', 'hide("~~")']);
  });

  it("leaves a link showing only its text", () => {
    expect(ranges("see [the docs](x.md) now")).toEqual([
      'hide("[")',
      'link("the docs")',
      'hide("]")',
      'hide("(")',
      'hide("x.md")',
      'hide(")")',
    ]);
  });

  it("shows the alias of a wikilink", () => {
    expect(ranges("see [[notes/file|the file]] now")).toEqual([
      'hide("[[notes/file|")',
      'link("the file")',
      'hide("]]")',
    ]);
    expect(ranges("[[plain]]")).toEqual(['hide("[[")', 'link("plain")', 'hide("]]")']);
  });

  it("keeps `==mark==` as a highlight", () => {
    expect(ranges("a ==yes== b")).toEqual(['hide("==")', 'highlight("yes")', 'hide("==")']);
  });

  it("sizes a heading and moves its `#` into the margin", () => {
    expect(ranges("## Title")).toEqual(['heading("")', 'hide("## ")']);
  });

  it("takes the `>` off a quote", () => {
    expect(ranges("> quoted")).toEqual(['quote("")', 'hide("> ")']);
  });

  it("turns a task marker into a box", () => {
    expect(ranges("- [ ] open")).toEqual(['check-off("[ ]")']);
    expect(ranges("- [x] done")).toEqual(['check-on("[x]")']);
  });

  it("leaves list markers and fenced code alone", () => {
    expect(ranges("- item")).toEqual([]);
    expect(ranges("```js\nconst x = **1**;\n```")).toEqual([]);
    expect(ranges("    indented **code**")).toEqual([]);
  });
});

describe("the line being edited", () => {
  it("shows its markers again", () => {
    expect(ranges("**bold**\n*it*", 1)).toEqual(['hide("*")', 'hide("*")']);
    expect(ranges("**bold**\n*it*", 2)).toEqual(['hide("**")', 'hide("**")']);
  });

  it("keeps the heading size but drops the margin glyph", () => {
    const state = stateOf("# Title");
    const [heading] = richRanges(state, 0, state.doc.length, new Set([1]));
    expect(heading?.kind).toBe("heading");
    expect(heading?.level).toBe(1);
    expect(heading?.mark).toBeUndefined();
  });

  it("shows the checkbox as text", () => {
    expect(ranges("- [x] done", 1)).toEqual([]);
  });
});

describe("only what is visible", () => {
  it("ignores the rest of the document", () => {
    const doc = ["**one**", "**two**", "**three**"].join("\n");
    const state = stateOf(doc);
    const second = state.doc.line(2);
    const out = richRanges(state, second.from, second.to, new Set());
    expect(out.every((r) => r.from >= second.from && r.to <= second.to)).toBe(true);
    expect(out).toHaveLength(2);
  });
});
