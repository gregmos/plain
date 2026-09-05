import { useEffect, useMemo, useRef, useState } from "react";
import { matchesChord } from "../app/chords";
import { clearPaint, findRanges, paint, scrollRangeIntoView } from "./find";

interface Props {
  /** The scroll container; also the tree that gets searched. */
  container: HTMLElement | null;
  /** Bumped whenever the rendered html changes, to redo the search. */
  revision: number;
  /** Bumped by every `Ctrl+F`, so a second one re-focuses the field. */
  focusToken: number;
  onClose: () => void;
}

/** 36px strip under the mode bar, same shape as a banner (spec §5.1). */
export function FindBar({ container, revision, focusToken, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusToken]);

  const ranges = useMemo(
    () => (container ? findRanges(container, query, caseSensitive) : []),
    // `revision` is the point: the same query over freshly rendered html.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [container, query, caseSensitive, revision],
  );

  const at = ranges.length === 0 ? 0 : ((index % ranges.length) + ranges.length) % ranges.length;

  useEffect(() => {
    const current = ranges[at] ?? null;
    paint(ranges, current);
    if (current && container) scrollRangeIntoView(container, current);
  }, [ranges, at, container]);

  useEffect(() => clearPaint, []);

  const step = (delta: number) => {
    if (ranges.length > 0) setIndex((value) => value + delta);
  };

  // F3 / Shift+F3 work while the field has focus and while it does not.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (matchesChord("F3", event)) {
        event.preventDefault();
        step(1);
      } else if (matchesChord("Shift+F3", event)) {
        event.preventDefault();
        step(-1);
      } else if (matchesChord("Escape", event)) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="findbar">
      <input
        ref={input}
        className="find-input"
        value={query}
        placeholder="find"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          step(event.shiftKey ? -1 : 1);
        }}
      />
      <span className="find-count">
        {query === "" ? "" : ranges.length === 0 ? "no matches" : `${at + 1} / ${ranges.length}`}
      </span>
      <button
        className={"find-toggle" + (caseSensitive ? " is-active" : "")}
        onClick={() => setCaseSensitive((value) => !value)}
        title="match case"
      >
        Aa
      </button>
      <button className="link" onClick={onClose}>
        close
      </button>
    </div>
  );
}
