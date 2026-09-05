import { openLibrary } from "../app/commands";
import { basename } from "../app/paths";
import { activeDoc, useStore } from "../app/store";
import { Outline } from "./Outline";
import "./rail.css";

export function Rail() {
  const docs = useStore((s) => s.docs);
  const activeId = useStore((s) => s.activeId);
  const doc = useStore(activeDoc);
  const railView = useStore((s) => s.railView);
  const libraryPath = useStore((s) => s.libraryPath);
  const activate = useStore((s) => s.activate);
  const closeDoc = useStore((s) => s.closeDoc);
  const setRailView = useStore((s) => s.setRailView);

  return (
    <aside className="rail">
      <div className="rail-search">
        <span>⌕ search</span>
        <span className="rail-hint">ctrl k</span>
      </div>

      <section className="rail-section">
        <div className="section-title rail-heading">open</div>
        {docs.length === 0 ? (
          <div className="rail-empty">nothing open</div>
        ) : (
          docs.map((doc) => (
            <button
              key={doc.id}
              className={"rail-item" + (doc.id === activeId ? " is-active" : "")}
              onClick={() => activate(doc.id)}
              onAuxClick={(e) => {
                if (e.button === 1) closeDoc(doc.id);
              }}
            >
              <span className="rail-item-name">{doc.title}</span>
              {doc.dirty && <span className="dot">●</span>}
            </button>
          ))
        )}
      </section>

      <section className="rail-section">
        <div className="section-title rail-heading">{railView}</div>
        {railView === "files" ? (
          libraryPath ? (
            <div className="rail-empty">{basename(libraryPath)}</div>
          ) : (
            <button className="rail-empty link" onClick={() => void openLibrary()}>
              open a library
            </button>
          )
        ) : (
          <Outline doc={doc} />
        )}
      </section>

      <footer className="rail-footer">
        {libraryPath && <div className="rail-path">{libraryPath}</div>}
        <div className="rail-switch">
          <button
            className={railView === "files" ? "is-active" : "link"}
            onClick={() => setRailView("files")}
          >
            files
          </button>
          <span className="sep">·</span>
          <button
            className={railView === "outline" ? "is-active" : "link"}
            onClick={() => setRailView("outline")}
          >
            outline
          </button>
        </div>
      </footer>
    </aside>
  );
}
