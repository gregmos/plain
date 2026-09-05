import { crumbParts } from "../app/paths";
import { activeDoc, useStore, type Mode } from "../app/store";

const MODES: Mode[] = ["read", "edit", "rich"];

export function ModeBar() {
  const railCollapsed = useStore((s) => s.railCollapsed);
  const toggleRail = useStore((s) => s.toggleRail);
  const libraryPath = useStore((s) => s.libraryPath);
  const doc = useStore(activeDoc);
  const setMode = useStore((s) => s.setMode);

  const crumbs = crumbParts(libraryPath, doc);

  return (
    <div className="modebar">
      <div className="modebar-left">
        {railCollapsed && (
          <button className="rail-peek" onClick={toggleRail}>
            ▸ files
          </button>
        )}
        {crumbs && (
          <div className="crumbs">
            <span className="crumb crumb-root">{crumbs.root}</span>
            {/* The folders in between are one cell, and it is the one that
                gives way first: `library / notes/pro… / тз.md`. */}
            {crumbs.middle.length > 0 && (
              <>
                <span className="crumb-sep">/</span>
                <span className="crumb crumb-middle" title={crumbs.middle.join(" / ")}>
                  {crumbs.middle.join(" / ")}
                </span>
              </>
            )}
            {crumbs.leaf !== null && (
              <>
                <span className="crumb-sep">/</span>
                <span className="crumb crumb-leaf" title={crumbs.leaf}>
                  {crumbs.leaf}
                </span>
              </>
            )}
            {doc?.dirty && <span className="dot">•</span>}
          </div>
        )}
      </div>

      <div className="modes">
        {MODES.map((mode) => (
          <button
            key={mode}
            className={"mode" + (doc?.mode === mode ? " is-active" : "")}
            onClick={() => doc && setMode(mode)}
          >
            {mode}
          </button>
        ))}
        {/* Split is the two of them at once, so it stands a little apart. */}
        <button
          className={"mode mode-split" + (doc?.mode === "split" ? " is-active" : "")}
          onClick={() => doc && setMode("split")}
        >
          split
        </button>
      </div>
    </div>
  );
}
