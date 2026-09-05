// Find/replace in the style of the app: a 36px strip under the mode bar,
// text controls only, glyph toggles `Aa · W · .*` (spec §5.2).

import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";
import type { EditorState } from "@codemirror/state";
import type { Command, EditorView, Panel, ViewUpdate } from "@codemirror/view";

const MAX_COUNT = 2000;

const TOGGLES = ["caseSensitive", "wholeWord", "regexp"] as const;
type Toggle = (typeof TOGGLES)[number];

/** `3 / 12`, where the index is the match the selection is sitting on. */
function matchInfo(state: EditorState, query: SearchQuery): string {
  if (!query.valid) return "";
  const selection = state.selection.main;
  const cursor = query.getCursor(state);
  let total = 0;
  let index = 0;
  for (let step = cursor.next(); !step.done; step = cursor.next()) {
    total += 1;
    if (step.value.from === selection.from && step.value.to === selection.to) index = total;
    if (total >= MAX_COUNT) return `${index} / ${MAX_COUNT}+`;
  }
  return `${index} / ${total}`;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

class FindPanel implements Panel {
  readonly dom: HTMLElement;
  readonly top = true;
  private readonly find: HTMLInputElement;
  private readonly replace: HTMLInputElement;
  private readonly count: HTMLElement;
  private readonly toggles: Record<Toggle, HTMLElement>;
  private readonly replaceRow: HTMLElement;

  constructor(private readonly view: EditorView) {
    const query = getSearchQuery(view.state);

    this.find = element("input", "find-field");
    this.find.placeholder = "find";
    this.find.value = query.search;
    this.find.setAttribute("main-field", "true");

    this.replace = element("input", "find-field");
    this.replace.placeholder = "replace";
    this.replace.value = query.replace;

    this.count = element("span", "find-count");
    this.toggles = {
      caseSensitive: element("button", "find-toggle", "Aa"),
      wholeWord: element("button", "find-toggle", "W"),
      regexp: element("button", "find-toggle", ".*"),
    };

    const replaceButton = element("button", "link", "replace");
    const replaceAllButton = element("button", "link", "all");
    this.replaceRow = element("span", "find-replace");
    this.replaceRow.append(this.replace, replaceButton, replaceAllButton);
    this.replaceRow.hidden = true;

    this.dom = element("div", "find");
    this.dom.append(
      element("span", "find-glyph", "⌕"),
      this.find,
      this.toggles.caseSensitive,
      this.toggles.wholeWord,
      this.toggles.regexp,
      this.count,
      this.replaceRow,
      element("span", "find-hint", "esc"),
    );

    this.find.addEventListener("input", () => this.commit());
    this.replace.addEventListener("input", () => this.commit());
    for (const key of TOGGLES) {
      this.toggles[key].addEventListener("click", () => {
        this.commit({ [key]: !getSearchQuery(this.view.state)[key] });
      });
    }
    replaceButton.addEventListener("click", () => replaceNext(this.view));
    replaceAllButton.addEventListener("click", () => replaceAll(this.view));
    this.dom.addEventListener("keydown", (event) => this.onKey(event));

    this.render();
  }

  // `Ctrl+H`, `F3` and `Shift+F3` are registry chords and reach the editor
  // through remote.ts wherever the focus is; handling them here too would run
  // them twice (review #12).
  private onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearchPanel(this.view);
      this.view.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (event.target === this.replace) replaceNext(this.view);
      else if (event.shiftKey) findPrevious(this.view);
      else findNext(this.view);
    }
  }

  /** Pushes the fields into the editor's search state. */
  private commit(patch: Partial<Record<Toggle, boolean>> = {}): void {
    const current = getSearchQuery(this.view.state);
    const query = new SearchQuery({
      search: this.find.value,
      replace: this.replace.value,
      caseSensitive: patch["caseSensitive"] ?? current.caseSensitive,
      wholeWord: patch["wholeWord"] ?? current.wholeWord,
      regexp: patch["regexp"] ?? current.regexp,
    });
    this.view.dispatch({ effects: setSearchQuery.of(query) });
  }

  private render(): void {
    const query = getSearchQuery(this.view.state);
    this.toggles.caseSensitive.classList.toggle("is-on", query.caseSensitive);
    this.toggles.wholeWord.classList.toggle("is-on", query.wholeWord);
    this.toggles.regexp.classList.toggle("is-on", query.regexp);
    this.count.textContent = matchInfo(this.view.state, query);
  }

  showReplace(): void {
    this.replaceRow.hidden = false;
    this.replace.focus();
    this.replace.select();
  }

  mount(): void {
    this.render();
    this.find.select();
  }

  update(update: ViewUpdate): void {
    const queryChanged = update.transactions.some((tr) =>
      tr.effects.some((effect) => effect.is(setSearchQuery)),
    );
    if (update.docChanged || update.selectionSet || queryChanged) this.render();
  }
}

const panels = new WeakMap<EditorView, FindPanel>();

export function findPanel(view: EditorView): Panel {
  const panel = new FindPanel(view);
  panels.set(view, panel);
  return panel;
}

/** Ctrl+H: the same panel with the replace field showing. */
export const openReplace: Command = (view) => {
  openSearchPanel(view);
  panels.get(view)?.showReplace();
  return true;
};
