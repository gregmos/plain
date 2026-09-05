import { Fragment } from "react";
import { breadcrumbs } from "../app/paths";
import { activeDoc, useStore, type Mode } from "../app/store";

const MODES: Mode[] = ["read", "edit", "rich"];

/** Root is bold, the file name is plain fg, anything between is muted. */
function crumbClass(index: number, total: number): string {
  if (index === 0) return "crumb crumb-root";
  return index === total - 1 ? "crumb crumb-leaf" : "crumb";
}

export function ModeBar() {
  const railCollapsed = useStore((s) => s.railCollapsed);
  const toggleRail = useStore((s) => s.toggleRail);
  const libraryPath = useStore((s) => s.libraryPath);
  const doc = useStore(activeDoc);
  const setMode = useStore((s) => s.setMode);

  const crumbs = breadcrumbs(libraryPath, doc);

  return (
    <div className="modebar">
      <div className="modebar-left">
        {railCollapsed && (
          <button className="rail-peek" onClick={toggleRail}>
            ▸ files
          </button>
        )}
        {crumbs.length > 0 && (
          <div className="crumbs">
            {crumbs.map((crumb, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="crumb-sep">/</span>}
                <span className={crumbClass(i, crumbs.length)}>{crumb}</span>
              </Fragment>
            ))}
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
      </div>
    </div>
  );
}
