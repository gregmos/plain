// The floating format panel (spec §5.2, mockup 1d): a dark 30px strip above
// a selection made with the mouse. Keyboard selections do not get it — for
// those there are chords. One instance, owned by the view that made it.

import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import {
  insertLink,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleQuote,
  toggleStrike,
} from "./commands";

/** Mockup 1d: the strip sits 38px above the top of the selection. */
const OFFSET = 38;

interface Button {
  label: string;
  title: string;
  className: string;
  run: (view: EditorView) => boolean;
}

const BUTTONS: Button[] = [
  { label: "B", title: "bold", className: "tb-bold", run: toggleBold },
  { label: "I", title: "italic", className: "tb-italic", run: toggleItalic },
  { label: "S", title: "strikethrough", className: "tb-strike", run: toggleStrike },
  { label: "`", title: "code", className: "tb-code", run: toggleInlineCode },
  { label: "link", title: "link", className: "", run: insertLink },
  { label: "quote", title: "quote", className: "", run: toggleQuote },
];

/** `link` and `quote` sit behind the separator, as in the mockup. */
const SEPARATOR_BEFORE = 4;

class FormatToolbar {
  private dom: HTMLElement | null = null;
  /** Only the newest pending mouseup may place the panel. */
  private token = 0;
  /** A click on a button ends in a mouseup that must not bring it back. */
  private suppress = false;

  constructor(private view: EditorView) {
    view.dom.addEventListener("mouseup", this.onMouseUp);
    view.scrollDOM.addEventListener("scroll", this.hide);
    view.dom.addEventListener("focusout", this.onFocusOut);
  }

  update(update: ViewUpdate): void {
    // Typing, moving the caret and dragging a selection all take it away;
    // the mouseup that ends a drag is what brings it back.
    if (update.docChanged || update.selectionSet || update.focusChanged) this.hide();
  }

  destroy(): void {
    this.view.dom.removeEventListener("mouseup", this.onMouseUp);
    this.view.scrollDOM.removeEventListener("scroll", this.hide);
    this.view.dom.removeEventListener("focusout", this.onFocusOut);
    this.hide();
  }

  private onFocusOut = (event: FocusEvent): void => {
    // Clicking a button moves the focus inside the panel; that is not a blur.
    const next = event.relatedTarget;
    if (next instanceof Node && this.dom?.contains(next)) return;
    this.hide();
  };

  // CodeMirror settles the selection in its own mouseup handler, so the panel
  // is placed one task later, when the selection is the final one.
  private onMouseUp = (): void => {
    if (this.suppress) {
      this.suppress = false;
      return;
    }
    const token = ++this.token;
    window.setTimeout(() => {
      if (token === this.token) this.show();
    }, 0);
  };

  private hide = (): void => {
    this.token += 1;
    this.dom?.remove();
    this.dom = null;
  };

  private build(): HTMLElement {
    const dom = document.createElement("div");
    dom.className = "format-toolbar";
    BUTTONS.forEach((button, index) => {
      if (index === SEPARATOR_BEFORE) {
        const separator = document.createElement("span");
        separator.className = "tb-sep";
        dom.append(separator);
      }
      const element = document.createElement("button");
      if (button.className) element.className = button.className;
      element.title = button.title;
      element.textContent = button.label;
      // mousedown, not click: the default would take the selection away
      // before the command has anything to work on.
      element.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.suppress = true;
        this.hide();
        button.run(this.view);
        this.view.focus();
      });
      dom.append(element);
    });
    return dom;
  }

  private show(): void {
    const { main } = this.view.state.selection;
    if (main.empty || !this.view.hasFocus) return;

    const coords = this.view.coordsAtPos(main.from);
    if (!coords) return;

    const dom = this.dom ?? this.build();
    if (!dom.isConnected) this.view.dom.append(dom);
    this.dom = dom;

    // coordsAtPos is in client space; the panel is absolute inside .cm-editor.
    const host = this.view.dom.getBoundingClientRect();
    const left = Math.min(
      Math.max(0, coords.left - host.left),
      Math.max(0, host.width - dom.offsetWidth),
    );
    dom.style.left = `${Math.round(left)}px`;
    dom.style.top = `${Math.round(coords.top - host.top - OFFSET)}px`;
  }
}

export const formatToolbar: Extension = ViewPlugin.fromClass(FormatToolbar);
