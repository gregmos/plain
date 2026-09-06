import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { activeFormats } from "./active";

/** `|` marks where the caret is. */
function at(input: string): string[] {
  const pos = input.indexOf("|");
  const state = EditorState.create({
    doc: input.replace("|", ""),
    extensions: markdown({ base: markdownLanguage }),
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return [...activeFormats(state, pos)].sort();
}

describe("what the caret is standing in (spec §5.2, v2.6)", () => {
  it("knows the inline marks", () => {
    expect(at("some **bo|ld** here")).toEqual(["bold"]);
    expect(at("some *it|alic* here")).toEqual(["italic"]);
    expect(at("some ~~o|ut~~ here")).toEqual(["strike"]);
    expect(at("some `co|de` here")).toEqual(["code"]);
    expect(at("plain t|ext")).toEqual([]);
  });

  it("knows headings and quotes", () => {
    expect(at("## Ti|tle")).toEqual(["heading2"]);
    expect(at("# Ti|tle")).toEqual(["heading1"]);
    expect(at("> quo|ted")).toEqual(["quote"]);
  });

  it("knows the kind of list the line is", () => {
    expect(at("- it|em")).toEqual(["bullet"]);
    expect(at("1. it|em")).toEqual(["ordered"]);
    expect(at("- [ ] it|em")).toEqual(["task"]);
  });

  it("knows what the grammar does not: ==mark== and [[wikilinks]]", () => {
    expect(at("a ==ye|s== b")).toEqual(["highlight"]);
    expect(at("a [[fi|le]] b")).toEqual(["wikilink"]);
    expect(at("a ==yes== |b")).toEqual([]);
  });

  it("reports every layer at once", () => {
    expect(at("## **bo|ld** title")).toEqual(["bold", "heading2"]);
    expect(at("- **bo|ld** item")).toEqual(["bold", "bullet"]);
  });
});
