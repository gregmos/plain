Edge cases
==========

A setext H1 above, and a setext H2 below.

Setext level two
----------------

Checked again: the caret survives a kill. The reliable caret survives a kill.

## Duplicate

First one.

## Duplicate

Second one — the slugs have to differ.

## Duplicate

Third one.

##

A heading with no text at all, right above this line.

## Escapes

Not emphasis: \*stars\*, not a link: \[\[brackets\]\], not a heading: \# hash.

Entities: &amp; &#42; &#x2A; &copy;.

## Empty things

- 
- an empty item above

|  |  |
|---|---|
|  | a table with blanks |

> 
> a quote that starts empty

## Fences that look like headings

```md
# not a heading
## also not a heading
```

    # an indented code block, also not a heading
    ## and another

## Raw html we do not keep

<script>alert("edge")</script>

<button onclick="alert(2)">no</button>

<picture><source srcset="a.png 1x, b.png 2x"><img src="a.png" alt="p"></picture>

<a href="javascript:void(0)">no</a>

<img srcset="a.png 1x, b.png 2x" src="a.png" alt="bare set attribute">

<a href="data:text/html,&lt;script&gt;alert(1)&lt;/script&gt;">data link</a>

## Image sources nobody should follow

![svg](data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=)

![png](data:image/png;base64,iVBORw0KGgo=)

![js](javascript:alert(1))

<img src="vbscript:msgbox(1)" alt="vb">

## Headings written as html

The two below carry the same words as the markdown headings above.

<h2>Duplicate</h2>

<h3>Escapes</h3>

## Long line

Очень длинная строка без переносов: аааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааааа конец.

Search marker: needle-edge-023 — leave it.
