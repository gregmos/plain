import { useMemo } from "react";
import { countWords } from "../read/words";
import { activeDoc, useStore } from "../app/store";

export function StatusBar() {
  const message = useStore((s) => s.message);
  const doc = useStore(activeDoc);
  const resolvedTheme = useStore((s) => s.resolvedTheme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  const state = doc
    ? doc.readOnly
      ? "read-only"
      : doc.dirty
        ? "unsaved"
        : doc.large
          ? "large file"
          : "saved"
    : null;

  // Messages win for their three seconds; otherwise edit shows the caret.
  const caret =
    doc?.mode === "edit" && doc.caret ? `ln ${doc.caret.line}, col ${doc.caret.col}` : null;
  const left = message ?? caret;

  // Wave 3 changes the text on every keystroke, so keep this off that path.
  const text = doc?.text ?? "";
  const words = useMemo(() => countWords(text), [text]);

  return (
    <div className="statusbar">
      <span className="status-left">{left}</span>
      <span className="status-right">
        {doc && <span>utf-8</span>}
        {doc && <span className="status-words">{words.toLocaleString("en-US")} words</span>}
        {state && <span>{state}</span>}
        <button className="link theme-toggle" onClick={toggleTheme}>
          {resolvedTheme === "dark" ? "◑ dark" : "◐ light"}
        </button>
      </span>
    </div>
  );
}
