import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { blockOf, changeBlocks, diffRows } from "../app/history";
import { takeComparison } from "../app/save";
import { useStore, type Comparison } from "../app/store";
import "./dialogs.css";
import { useScreenFocus } from "./screen";

/**
 * The conflict banner's `compare` and the history screen's, one screen (spec
 * §2a). Choosing here is the whole answer: `take …` replaces the buffer, and
 * `keep mine` just closes.
 */
export function DiffScreen({ comparison }: { comparison: Comparison }) {
  const scroller = useScreenFocus<HTMLDivElement>();
  const close = useStore((s) => s.setComparison);
  const rows = useMemo(
    () => diffRows(comparison.left, comparison.right),
    [comparison.left, comparison.right],
  );
  const blocks = useMemo(() => changeBlocks(rows), [rows]);
  const [current, setCurrent] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  // A long file with three changes in it is otherwise a scroll hunt.
  const step = useCallback(
    (by: number) => {
      if (blocks.length === 0) return;
      setCurrent((was) => (was + by + blocks.length) % blocks.length);
    },
    [blocks.length],
  );

  useEffect(() => setCurrent(0), [rows]);

  // Scrolls the run of changed lines into the middle rather than to the top,
  // so the lines around it are visible too.
  useEffect(() => {
    const start = blocks[current];
    if (start === undefined) return;
    const line = list.current?.children[start];
    line?.scrollIntoView({ block: "center" });
  }, [blocks, current]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
        return;
      }
      // The same keys that step through matches in find, for the same reason.
      if (event.key === "F3") {
        event.preventDefault();
        step(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, step]);

  // The screen stays up until the text is really in the buffer: closing it
  // first would hand the editor back while the swap was still being decided,
  // and anything typed in between would be overwritten (review #2).
  const take = () => {
    void takeComparison(comparison).then((done) => {
      if (done) close(null);
    });
  };

  return (
    <div className="screen" tabIndex={0} ref={scroller}>
      <div className="screen-column screen-wide">
        <div className="screen-head">
          <div className="screen-title">compare</div>
          <button className="link" onClick={() => close(null)}>
            close
          </button>
        </div>

        <div className="diff-heads">
          {/* The glyphs say which side is which, and the gutter repeats them
              line by line — colour alone would not. */}
          <span className="diff-mark">−</span>
          <span className="diff-head">{comparison.leftLabel}</span>
          <span className="sep">·</span>
          <span className="diff-mark">+</span>
          <span className="diff-head">{comparison.rightLabel}</span>

          <span className="diff-nav">
            {blocks.length > 1 && (
              <>
                <button className="link" onClick={() => step(-1)} title="shift f3">
                  previous
                </button>
                <span className="sep">·</span>
                <button className="link" onClick={() => step(1)} title="f3">
                  next
                </button>
                <span className="sep">·</span>
              </>
            )}
            <span className="screen-when">
              {blocks.length === 0
                ? "no differences"
                : blocks.length === 1
                  ? "1 difference"
                  : `${current + 1} of ${blocks.length} differences`}
            </span>
          </span>
        </div>

        <div className="diff" ref={list}>
          {rows.map((row, index) => (
            <div
              className={
                `diff-line diff-${row.kind}` +
                (blockOf(blocks, rows, index) === current ? " diff-current" : "")
              }
              key={index}
            >
              <span className="diff-gutter" aria-hidden>
                {row.kind === "removed" ? "−" : row.kind === "added" ? "+" : " "}
              </span>
              {row.text === "" ? " " : row.text}
            </div>
          ))}
        </div>

        <div className="screen-actions">
          <button className="link" onClick={() => close(null)}>
            keep mine
          </button>
          <span className="sep">·</span>
          <button className="link" onClick={take}>
            {comparison.takeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
