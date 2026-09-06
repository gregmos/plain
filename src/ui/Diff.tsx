import { useEffect, useMemo } from "react";
import { diffRows } from "../app/history";
import { takeComparison } from "../app/save";
import { useStore, type Comparison } from "../app/store";
import "./dialogs.css";

/**
 * The conflict banner's `compare` and the history screen's, one screen (spec
 * §2a). Choosing here is the whole answer: `take …` replaces the buffer, and
 * `keep mine` just closes.
 */
export function DiffScreen({ comparison }: { comparison: Comparison }) {
  const close = useStore((s) => s.setComparison);
  const rows = useMemo(
    () => diffRows(comparison.left, comparison.right),
    [comparison.left, comparison.right],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const changed = rows.filter((row) => row.kind !== "same").length;

  // The screen stays up until the text is really in the buffer: closing it
  // first would hand the editor back while the swap was still being decided,
  // and anything typed in between would be overwritten (review #2).
  const take = () => {
    void takeComparison(comparison).then((done) => {
      if (done) close(null);
    });
  };

  return (
    <div className="screen">
      <div className="screen-column screen-wide">
        <div className="screen-head">
          <div className="screen-title">compare</div>
          <button className="link" onClick={() => close(null)}>
            close
          </button>
        </div>
        <div className="diff-heads">
          <span className="diff-head diff-head-left">{comparison.leftLabel}</span>
          <span className="sep">·</span>
          <span className="diff-head">{comparison.rightLabel}</span>
          <span className="screen-when">
            {changed === 0 ? "no differences" : `${changed} lines differ`}
          </span>
        </div>

        <div className="diff">
          {rows.map((row, index) => (
            <div className={`diff-line diff-${row.kind}`} key={index}>
              {row.text === "" ? " " : row.text}
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
