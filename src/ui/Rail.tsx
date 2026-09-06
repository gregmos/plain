import { closeDocs } from "../app/close";
import { openPaths, openQuickSearch } from "../app/commands";
import { activeDoc, useStore } from "../app/store";
import { FileTree } from "./FileTree";
import { Outline } from "./Outline";
import "./rail.css";
import "./library.css";

/** `tags` under the tree (mockup 1e): the tag, how many files, click filters. */
function Tags() {
  const tags = useStore((s) => s.tags);
  const filter = useStore((s) => s.libraryFilterTag);
  if (tags.length === 0) return null;

  return (
    <section className="rail-section rail-side">
      <div className="section-title rail-heading">tags</div>
      {tags.map((entry) => (
        <button
          key={entry.tag}
          className={"rail-tag" + (entry.tag === filter ? " is-active" : "")}
          title={`${entry.count} ${entry.count === 1 ? "file" : "files"}`}
          onClick={() => useStore.getState().toggleLibraryFilter(entry.tag)}
        >
          <span className="rail-tag-name">#{entry.tag}</span>
          <span className="rail-tag-count">{entry.count}</span>
        </button>
      ))}
    </section>
  );
}

/**
 * `links here` under the outline (mockup 1d): the files pointing at this one.
 * A click opens the file in read. Read has no way to scroll to a source line
 * — its anchors are headings — so the line is shown but not jumped to; the
 * number is in the row so you know where to look.
 */
function Backlinks() {
  const backlinks = useStore((s) => s.backlinks);
  const libraryPath = useStore((s) => s.libraryPath);
  if (!libraryPath) return null;

  return (
    <section className="rail-section rail-side">
      <div className="section-title rail-heading">links here</div>
      {backlinks.length === 0 ? (
        <div className="rail-empty">nothing links here</div>
      ) : (
        backlinks.map((link) => (
          <button
            key={`${link.rel}:${link.line}`}
            className="backlink"
            title={`${link.rel}:${link.line}`}
            onClick={() => void openPaths([link.path])}
          >
            <span className="backlink-name">{link.name}</span>
            <span className="backlink-line">{link.text}</span>
          </button>
        ))
      )}
    </section>
  );
}

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

      {railView === "files" ? <Tags /> : <Backlinks />}

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
          {/* The mouse's way to what `Ctrl+\` does (spec §4). */}
          <button
            className="rail-collapse"
            title="collapse the rail"
            onClick={() => useStore.getState().toggleRail()}
          >
            ◂
          </button>
        </div>
      </footer>
    </aside>
  );
}
