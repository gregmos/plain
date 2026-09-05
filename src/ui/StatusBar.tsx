import { useMemo } from "react";
import { activeDoc, useStore } from "../app/store";

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;

/** Fenced-code exclusion belongs to the read pipeline (wave 2). */
export function countWords(text: string): number {
  if (!segmenter) return text.split(/\s+/).filter(Boolean).length;
  let count = 0;
  for (const part of segmenter.segment(text)) if (part.isWordLike) count += 1;
  return count;
}

export function StatusBar() {
  const message = useStore((s) => s.message);
  const doc = useStore(activeDoc);
  const resolvedTheme = useStore((s) => s.resolvedTheme);
  const toggleTheme = useStore((s) => s.toggleTheme);

  const state = doc ? (doc.readOnly ? "read-only" : doc.dirty ? "unsaved" : "saved") : null;

  // Wave 3 changes the text on every keystroke, so keep this off that path.
  const text = doc?.text ?? "";
  const words = useMemo(() => countWords(text), [text]);

  return (
    <div className="statusbar">
      {/* Left slot also carries `ln 9, col 118` once the editor exists. */}
      <span className="status-left">{message}</span>
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
