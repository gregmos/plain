import { emitGotoHeading, emitGotoLine } from "../read/events";
import { useActiveHeading } from "../read/outline";
import type { Doc } from "../app/store";

/**
 * Headings of the open document, without their `#`, 18px per level
 * (spec §4). Read scrolls; edit gets the line through an event, so the two
 * views stay unaware of each other.
 */
export function Outline({ doc }: { doc: Doc | null }) {
  const active = useActiveHeading();

  if (!doc || doc.headings.length === 0) {
    return <div className="rail-empty">no headings</div>;
  }

  return (
    <>
      {doc.headings.map((heading, index) => (
        <button
          key={`${heading.id}-${index}`}
          className={"outline-item" + (heading.id === active ? " is-active" : "")}
          style={{ paddingLeft: `calc(var(--rail-pad-x) + ${(heading.level - 1) * 18}px)` }}
          title={heading.text}
          onClick={() => {
            if (doc.mode === "read") emitGotoHeading(heading.id);
            else emitGotoLine(heading.line);
          }}
        >
          {heading.text || "—"}
        </button>
      ))}
    </>
  );
}
