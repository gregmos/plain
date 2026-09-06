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
            {/* Everything in front of the file name is one shrinking group,
                so the name cannot be the thing that gives way: the folders
                collapse to `…` first, then the root, and the trailing `/`
                goes with them rather than being left hanging. */}
            <span className="crumb-lead">
              <span className="crumb crumb-root" title={crumbs.root}>
                {crumbs.root}
              </span>
              {crumbs.middle.length > 0 && (
                <>
                  <span className="crumb-sep">/</span>
                  <span className="crumb crumb-middle" title={crumbs.middle.join(" / ")}>
                    {crumbs.middle.join(" / ")}
                  </span>
                </>
              )}
              {crumbs.leaf !== null && <span className="crumb-sep">/</span>}
            </span>
            {crumbs.leaf !== null && (
              <span className="crumb crumb-leaf" title={crumbs.leaf}>
                {crumbs.leaf}
              </span>
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
