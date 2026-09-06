import { useSyncExternalStore } from "react";
import { chordText } from "../app/chords";
import { runEditorCommand } from "../editor";
import { activeSnapshot, subscribeActive, type Format } from "../editor/active";
import {
  insertFootnote,
  insertLink,
  insertRule,
  insertTable,
  insertWikilink,
  toggleBold,
  toggleBulletList,
  toggleCheckbox,
  toggleHeading,
  toggleHighlight,
  toggleInlineCode,
  toggleItalic,
  toggleMathInline,
  toggleOrderedList,
  toggleQuote,
  toggleStrike,
} from "../editor/commands";
import { insertImageFromFile } from "../editor/images";
import { useStore } from "../app/store";
import "./formatbar.css";

interface Button {
  label: string;
  title: string;
  chord?: string;
  className?: string;
  format?: Format;
  run: () => void;
}

/** The bar of spec §5.2 (v2.6), in its order. Glyphs, never icons. */
const BUTTONS: Button[] = [
  { label: "B", title: "bold", chord: "Ctrl+B", className: "fb-bold", format: "bold", run: () => runEditorCommand(toggleBold) },
  { label: "I", title: "italic", chord: "Ctrl+I", className: "fb-italic", format: "italic", run: () => runEditorCommand(toggleItalic) },
  { label: "S", title: "strikethrough", chord: "Ctrl+Alt+S", className: "fb-strike", format: "strike", run: () => runEditorCommand(toggleStrike) },
  { label: "‹›", title: "code", chord: "Ctrl+E", format: "code", run: () => runEditorCommand(toggleInlineCode) },
  { label: "H1", title: "heading 1", chord: "Ctrl+1", format: "heading1", run: () => runEditorCommand(toggleHeading(1)) },
  { label: "H2", title: "heading 2", chord: "Ctrl+2", format: "heading2", run: () => runEditorCommand(toggleHeading(2)) },
  { label: "H3", title: "heading 3", chord: "Ctrl+3", format: "heading3", run: () => runEditorCommand(toggleHeading(3)) },
  { label: "•", title: "bulleted list", chord: "Ctrl+Alt+U", format: "bullet", run: () => runEditorCommand(toggleBulletList) },
  { label: "1.", title: "numbered list", chord: "Ctrl+Alt+E", format: "ordered", run: () => runEditorCommand(toggleOrderedList) },
  { label: "☐", title: "checkbox", chord: "Ctrl+Enter", format: "task", run: () => runEditorCommand(toggleCheckbox) },
  { label: "»", title: "quote", chord: "Ctrl+Shift+Q", format: "quote", run: () => runEditorCommand(toggleQuote) },
  { label: "link", title: "link", chord: "Ctrl+Shift+K", format: "link", run: () => runEditorCommand(insertLink) },
  { label: "img", title: "image", chord: "Ctrl+Alt+I", run: () => void insertImageFromFile() },
  { label: "table", title: "table", chord: "Ctrl+Alt+T", run: () => runEditorCommand(insertTable) },
  { label: "─", title: "horizontal rule", chord: "Ctrl+Alt+-", run: () => runEditorCommand(insertRule) },
  { label: "∑", title: "math", chord: "Ctrl+Alt+M", run: () => runEditorCommand(toggleMathInline) },
  { label: "==", title: "highlight", chord: "Ctrl+Alt+H", format: "highlight", run: () => runEditorCommand(toggleHighlight) },
  { label: "[[ ]]", title: "wikilink", chord: "Ctrl+Alt+W", format: "wikilink", run: () => runEditorCommand(insertWikilink) },
  { label: "[^]", title: "footnote", chord: "Ctrl+Alt+N", run: () => runEditorCommand(insertFootnote) },
];

function useActive(): ReadonlySet<Format> {
  return useSyncExternalStore(subscribeActive, activeSnapshot, activeSnapshot);
}

/** 30px above the editor in edit, rich and split; off with `edit.toolbar`. */
export function FormatBar() {
  const on = useStore((s) => s.settings.edit.toolbar);
  const active = useActive();
  if (!on) return null;

  return (
    <div className="formatbar">
      {BUTTONS.map((button) => (
        <button
          key={button.title}
          className={
            "fb" +
            (button.className ? ` ${button.className}` : "") +
            (button.format && active.has(button.format) ? " is-active" : "")
          }
          title={button.chord ? `${button.title} · ${chordText(button.chord)}` : button.title}
          // The selection is the command's argument: taking the focus away
          // first would leave nothing to format.
          onMouseDown={(event) => event.preventDefault()}
          onClick={button.run}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
