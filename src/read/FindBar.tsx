import { useEffect, useRef, useState } from "react";
import { matchesChord } from "../app/chords";
import { FIND_STEP } from "./events";
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

  // Searching happens in an effect, never while rendering: the parent writes
  // the html and runs its DOM pass in effects of its own, and a search made
  // during render would hand back ranges into nodes that are already gone
  // (review #11). `revision` is what says the DOM has settled.
  const [ranges, setRanges] = useState<Range[]>([]);

  useEffect(() => {
    setRanges(container && query !== "" ? findRanges(container, query, caseSensitive) : []);
  }, [container, query, caseSensitive, revision]);

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

  // F3 / Shift+F3 come from the command registry and work whether or not the
  // field has focus; `Esc` is the bar's own.
  useEffect(() => {
    const onStep = (event: Event) => step((event as CustomEvent<1 | -1>).detail);
    const onKey = (event: KeyboardEvent) => {
      if (!matchesChord("Escape", event)) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener(FIND_STEP, onStep);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(FIND_STEP, onStep);
      window.removeEventListener("keydown", onKey);
    };
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
