import { useEffect, useMemo } from "react";
import { markSaved, replaceText } from "../editor";
import { diffRows } from "../app/history";
import { reloadFromDisk } from "../app/save";
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

  const take = () => {
    const store = useStore.getState();
    // The disk version taken in full: base hash, saved text and the banner go
    // with it, so the next save is not a conflict all over again.
    if (comparison.fromDisk) {
      void reloadFromDisk(comparison.id, { force: true, note: "took the disk version" });
      close(null);
      return;
    }
    const doc = store.docs.find((d) => d.id === comparison.id);
    if (!doc) {
      close(null);
      return;
    }
    replaceText(comparison.id, comparison.left);
    // The left side is the disk or a snapshot; only the disk makes the buffer
    // clean, and that is what `savedText` already says.
    markSaved(comparison.id, doc.savedText);
    store.updateDoc(comparison.id, {
      text: comparison.left,
      dirty: comparison.left !== doc.savedText,
    });
    store.dismissBanner("conflict");
    close(null);
  };

  return (
    <div className="screen">
      <div className="screen-column screen-wide">
        <div className="screen-title">compare</div>
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
          <span className="sep">·</span>
          <button className="link" onClick={() => close(null)}>
            close
          </button>
        </div>
      </div>
    </div>
  );
}
