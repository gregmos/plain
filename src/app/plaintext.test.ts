// @vitest-environment happy-dom
// The extraction parses HTML, so these need a DOM. happy-dom is a dev
// dependency for exactly this.

import { describe, expect, it } from "vitest";
import { htmlToPlainText, plainTextOf } from "./commands";
import { render } from "../read/pipeline";
import { makeDoc } from "./store";

/** The whole path a copy takes: markdown -> read pipeline -> plain text. */
function plain(markdown: string): string {
  return plainTextOf(makeDoc({ id: "t", path: null, text: markdown })) ?? "";
}

/** Through the real renderer, which is where the scanner used to break. */
function rendered(markdown: string): string {
  return htmlToPlainText(render(markdown).html);
}

describe("htmlToPlainText — the three the scanner got wrong", () => {
  it("does not let an attribute containing `>` leak into the text", () => {
    expect(htmlToPlainText('<p><a href="#" title="a > b">label</a></p>')).toBe("label");
    // Through the renderer too: the title comes from the markdown itself.
    expect(rendered('[label](https://example.com "a > b")')).toBe("label");
  });

  it("keeps table cells apart instead of running them together", () => {
    const text = rendered("| a | b |\n| --- | --- |\n| A | B |");
    expect(text).toContain("A | B");
    expect(text).not.toContain("AB");
    expect(text.split("\n")).toEqual(["a | b", "A | B"]);
  });

  it("keeps a code block's indentation, trailing spaces and blank lines", () => {
    const code = ["    indented", "", "", "trailing   ", "    deep"].join("\n");
    const text = rendered(["```", code, "```"].join("\n"));
    expect(text).toBe(code);
  });
});

describe("htmlToPlainText", () => {
  it("drops the chrome a code block is wrapped in", () => {
    expect(rendered("```js\nconst a = 1;\n```")).toBe("const a = 1;");
  });

  it("keeps an image's alt text and nothing else", () => {
    expect(htmlToPlainText('<p>see <img src="x.png" alt="a diagram"> here</p>')).toBe(
      "see a diagram here",
    );
    expect(htmlToPlainText('<p><img src="x.png"></p>')).toBe("");
  });

  it("resolves entities and honours <br>", () => {
    expect(htmlToPlainText("<p>a &amp; b<br>c</p>")).toBe("a & b\nc");
  });

  it("collapses more than two blank lines into two, outside pre", () => {
    expect(htmlToPlainText("<p>a</p><div></div><div></div><div></div><p>b</p>")).toBe("a\n\nb");
  });

  it("collapses runs of spaces in prose", () => {
    expect(htmlToPlainText("<p>two   spaces</p>")).toBe("two spaces");
  });
});

describe("plainTextOf", () => {
  it("turns a document into text with no markers left", () => {
    const text = plain(
      [
        "# Title",
        "",
        "A paragraph with *emphasis* and a [link](https://example.com).",
        "",
        "- first",
        "- second",
        "",
        "```js",
        "const a = 1;",
        "```",
        "",
        "![a picture](pic.png)",
      ].join("\n"),
    );

    expect(text).toBe(
      [
        "Title",
        "",
        "A paragraph with emphasis and a link.",
        "",
        "first",
        "second",
        "",
        "const a = 1;",
        "",
        "a picture",
      ].join("\n"),
    );
    expect(text).not.toMatch(/[#*`]|\bcopy\b/);
  });

  it("puts every list item on its own line", () => {
    expect(plain("- one\n- two\n- three")).toBe("one\ntwo\nthree");
  });

  it("refuses a document too large to render (spec §8)", () => {
    const doc = makeDoc({ id: "big", path: null, text: "x" });
    expect(plainTextOf({ ...doc, large: true })).toBeNull();
  });
});
