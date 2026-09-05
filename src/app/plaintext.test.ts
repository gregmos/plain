import { describe, expect, it } from "vitest";
import { htmlToPlainText, plainTextOf } from "./commands";
import { makeDoc } from "./store";

/** The whole path a copy takes: markdown -> read pipeline -> plain text. */
function plain(markdown: string): string {
  return plainTextOf(makeDoc({ id: "t", path: null, text: markdown })) ?? "";
}

describe("htmlToPlainText", () => {
  it("drops the chrome a code block is wrapped in", () => {
    const html =
      '<div class="codeblock"><div class="code-bar"><span class="code-lang">js</span>' +
      '<button class="code-copy" type="button">copy</button></div>' +
      "<pre><code>const a = 1;\n</code></pre></div>";
    expect(htmlToPlainText(html)).toBe("const a = 1;");
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

  it("collapses more than two blank lines into two", () => {
    expect(htmlToPlainText("<p>a</p><div></div><div></div><div></div><p>b</p>")).toBe("a\n\nb");
  });

  it("keeps whitespace inside pre and collapses it outside", () => {
    // The outer trim owns the document's edges, so the indent has to be interior.
    expect(htmlToPlainText("<p>a</p><pre><code>  indented\n  code</code></pre>")).toBe(
      "a\n\n  indented\n  code",
    );
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
    // The markers themselves are gone, and so is the code block's chrome.
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
