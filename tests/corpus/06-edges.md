# Edges

## Images

Local, next to the file: ![схема](assets/схема.png)

Local, one folder up: ![outside](../images/x.png)

External: ![remote](https://example.com/a.png "with a title")

Inline data: ![dot](data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==)

Reference style: ![ref][pic]

[pic]: ./assets/ref.png

## Reference links

A [reference link][one] and a [collapsed one][] and a [shortcut].

[one]: ./01-basics.md
[collapsed one]: ./02-gfm.md
[shortcut]: ./03-cyrillic.md

## Escapes

Not emphasis: \*stars\*, not a link: \[\[brackets\]\], not a heading: \# hash.
Entities: &amp; &#42; &#x2A;.

## Empty and odd

- 
- an empty item above

|  |  |
|---|---|
|  | a table with blanks |

> 
> a quote that starts empty

##

A heading with no text at all, right above this line.

## Duplicate

## Duplicate

Two headings with the same text, so their slugs must differ.

## Very long line

Одна очень длинная строка без переносов, которая проверяет, что колонка чтения
не расползается: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
