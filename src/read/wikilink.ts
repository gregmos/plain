// Wikilinks: [[file]], [[file|alias]], [[file#Heading]] (spec §11).
//
// A micromark construct, not a regex over the text: `[[x]]` inside a code
// span or a fenced block must stay literal, and the construct has to be tried
// before micromark's own link-label start on `[`. Extensions merged without
// `add: "after"` land in front of the existing ones, which is what we want.

import { markdownLineEnding, markdownSpace } from "micromark-util-character";
import { codes } from "micromark-util-symbol";
import type {
  Code,
  Construct,
  Effects,
  Extension as MicromarkExtension,
  State,
  TokenizeContext,
} from "micromark-util-types";
import type {
  CompileContext,
  Extension as FromMarkdownExtension,
  Token,
} from "mdast-util-from-markdown";
import type { Root } from "mdast";
import type { Plugin } from "unified";
import type { Data, Node } from "unist";

declare module "micromark-util-types" {
  interface TokenTypeMap {
    wikiLink: "wikiLink";
    wikiLinkMarker: "wikiLinkMarker";
    wikiLinkDividerMarker: "wikiLinkDividerMarker";
    wikiLinkTarget: "wikiLinkTarget";
    wikiLinkHash: "wikiLinkHash";
    wikiLinkAlias: "wikiLinkAlias";
  }
}

export interface WikiLink extends Node {
  type: "wikiLink";
  /** Everything before `#` or `|`, verbatim. */
  target: string;
  /** Heading part after `#`, or null. */
  hash: string | null;
  /** Display text after `|`, or null. */
  alias: string | null;
  data?: Data;
}

function tokenize(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
  // A target of only whitespace (`[[ ]]`) is not a link.
  let solid = false;

  return start;

  function start(code: Code): State | undefined {
    effects.enter("wikiLink");
    effects.enter("wikiLinkMarker");
    effects.consume(code);
    return open;
  }

  function open(code: Code): State | undefined {
    if (code !== codes.leftSquareBracket) return nok(code);
    effects.consume(code);
    effects.exit("wikiLinkMarker");
    effects.enter("wikiLinkTarget");
    return target;
  }

  function target(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return nok(code);
    if (code === codes.leftSquareBracket) return nok(code);
    if (code === codes.numberSign || code === codes.verticalBar) {
      if (!solid) return nok(code);
      effects.exit("wikiLinkTarget");
      return divider(code);
    }
    if (code === codes.rightSquareBracket) {
      if (!solid) return nok(code);
      effects.exit("wikiLinkTarget");
      return closeStart(code);
    }
    if (!markdownSpace(code)) solid = true;
    effects.consume(code);
    return target;
  }

  /** `#` opens the heading part, `|` the alias; both are one-character. */
  function divider(code: Code): State | undefined {
    const hash = code === codes.numberSign;
    effects.enter("wikiLinkDividerMarker");
    effects.consume(code);
    effects.exit("wikiLinkDividerMarker");
    effects.enter(hash ? "wikiLinkHash" : "wikiLinkAlias");
    return hash ? inHash : inAlias;
  }

  function inHash(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return nok(code);
    if (code === codes.leftSquareBracket) return nok(code);
    if (code === codes.verticalBar) {
      effects.exit("wikiLinkHash");
      return divider(code);
    }
    if (code === codes.rightSquareBracket) {
      effects.exit("wikiLinkHash");
      return closeStart(code);
    }
    effects.consume(code);
    return inHash;
  }

  function inAlias(code: Code): State | undefined {
    if (code === codes.eof || markdownLineEnding(code)) return nok(code);
    if (code === codes.leftSquareBracket) return nok(code);
    if (code === codes.rightSquareBracket) {
      effects.exit("wikiLinkAlias");
      return closeStart(code);
    }
    effects.consume(code);
    return inAlias;
  }

  function closeStart(code: Code): State | undefined {
    effects.enter("wikiLinkMarker");
    effects.consume(code);
    return closeEnd;
  }

  function closeEnd(code: Code): State | undefined {
    if (code !== codes.rightSquareBracket) return nok(code);
    effects.consume(code);
    effects.exit("wikiLinkMarker");
    effects.exit("wikiLink");
    return ok;
  }
}

const construct: Construct = { name: "wikiLink", tokenize };

export function wikiLinkSyntax(): MicromarkExtension {
  return { text: { [codes.leftSquareBracket]: construct } };
}

/** What the link shows when it has no alias. */
export function displayText(link: Pick<WikiLink, "target" | "hash" | "alias">): string {
  if (link.alias) return link.alias;
  return link.hash ? `${link.target} › ${link.hash}` : link.target;
}

function top(context: CompileContext): WikiLink {
  return context.stack[context.stack.length - 1] as unknown as WikiLink;
}

export function wikiLinkFromMarkdown(): FromMarkdownExtension {
  return {
    enter: {
      wikiLink(this: CompileContext, token: Token) {
        const node: WikiLink = { type: "wikiLink", target: "", hash: null, alias: null };
        this.enter(node as never, token);
      },
    },
    exit: {
      wikiLinkTarget(this: CompileContext, token: Token) {
        top(this).target = this.sliceSerialize(token);
      },
      wikiLinkHash(this: CompileContext, token: Token) {
        top(this).hash = this.sliceSerialize(token);
      },
      wikiLinkAlias(this: CompileContext, token: Token) {
        top(this).alias = this.sliceSerialize(token);
      },
      wikiLink(this: CompileContext, token: Token) {
        const node = top(this);
        // The path is resolved in the DOM (a missing file is muted and dead),
        // so the target travels as data-* and the element gets no href here.
        node.data = {
          hName: "a",
          hProperties: {
            className: ["wikilink"],
            dataWiki: node.target,
            ...(node.hash ? { dataWikiHash: node.hash } : {}),
          },
          hChildren: [{ type: "text", value: displayText(node) }],
        };
        this.exit(token);
      },
    },
  };
}

/** unified plugin: syntax extension + mdast handlers. */
export const remarkWikiLink: Plugin<[], Root> = function () {
  const data = this.data();
  const micromark = data.micromarkExtensions ?? (data.micromarkExtensions = []);
  const fromMarkdown = data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = []);
  micromark.push(wikiLinkSyntax());
  fromMarkdown.push(wikiLinkFromMarkdown());
};
