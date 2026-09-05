# GFM

## Table

| package | version | why |
|---|:---:|---:|
| unified | 11 | one parser |
| shiki | 4 | fine-grained |
| katex | 0.18 | no mathjax |

A cell with an escaped pipe: `a \| b`.

## Task list

- [ ] read the spec
- [x] write the pipeline
- [ ] look at it in a window

## Strikethrough and autolinks

This is ~~wrong~~ right. Visit https://commonmark.org or write to
someone@example.com — both become links on their own.

## Footnotes

Plain text outlives its tools[^tools], and that is the whole argument[^arg].

[^tools]: Editors come and go; the bytes do not.
[^arg]: Which is why this file is a file.

## Alerts

> [!NOTE]
> Alerts and callouts are the same construct here.

> [!WARNING] Mixed line endings
> Saving normalises them, and says so in the status bar.
