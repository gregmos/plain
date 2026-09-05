# Callouts and raw html

> [!note]
> A callout with no title at all.

> [!tip] Keep it short
> Titles are optional, and they can carry **inline** markup.

> [!warning] Nested content
>
> - a list inside a callout
> - and a second item
>
> ```js
> const inside = true;
> ```
>
> > and a quote inside the callout

> [!ЗАМЕТКА]
> A type that is not ascii is not a callout, so this stays a quote.

> An ordinary quote, still a quote.

## Details

<details>
<summary>what is inside</summary>

Hidden until asked for. Even a list:

- one
- two

</details>

## Marks

Highlighting ==a phrase== and ==другую фразу== in the middle of a sentence.

## Raw html we keep

Some <b>bold</b>, some <em>emphasis</em>, a <kbd>Ctrl</kbd>+<kbd>S</kbd>,
a <sub>sub</sub> and a <sup>sup</sup>.

<div align="center">A div with an attribute.</div>

## Raw html we drop

<script>window.alert(1)</script>

<p onclick="window.alert(1)">A paragraph with a handler.</p>

<iframe src="https://example.com"></iframe>

<a href="javascript:alert(1)">a bad link</a>

<img src="data:image/svg+xml,<svg onload=alert(1)>" alt="bad image">
