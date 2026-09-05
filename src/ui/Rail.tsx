import { closeDocs } from "../app/close";
import { openQuickSearch } from "../app/commands";
import { activeDoc, useStore } from "../app/store";
import { FileTree } from "./FileTree";
import { Outline } from "./Outline";
import "./rail.css";

export function Rail() {
  const docs = useStore((s) => s.docs);
  const activeId = useStore((s) => s.activeId);
  const doc = useStore(activeDoc);
  const railView = useStore((s) => s.railView);
  const libraryPath = useStore((s) => s.libraryPath);
  const treeFiles = useStore((s) => s.treeFiles);
  const activate = useStore((s) => s.activate);
  const setRailView = useStore((s) => s.setRailView);

  return (
    <aside className="rail">
      <button className="rail-search" onClick={() => openQuickSearch()}>
        <span>⌕ search</span>
        <span className="rail-hint">ctrl k</span>
      </button>

      <section className="rail-section rail-open">
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
                if (e.button === 1) closeDocs([doc.id]);
              }}
            >
              <span className="rail-item-name">{doc.title}</span>
              {doc.dirty && <span className="dot">●</span>}
            </button>
          ))
        )}
      </section>

      <section className="rail-section rail-main">
        {/* Folder headings label the tree themselves (mockup 1a); the
            outline has nothing else to say what it is. */}
        {(railView === "outline" || !libraryPath) && (
          <div className="section-title rail-heading">{railView}</div>
        )}
        {railView === "files" ? <FileTree /> : <Outline doc={doc} />}
      </section>

      <footer className="rail-footer">
        {libraryPath && (
          <>
            <div>{treeFiles === 1 ? "1 file" : `${treeFiles} files`}</div>
            <div className="rail-path" title={libraryPath}>
              {libraryPath}
            </div>
          </>
        )}
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
