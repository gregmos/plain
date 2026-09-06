// The library screen (mockup 1e, spec §2a): every file of the tree, sorted,
// with the dates the tree already knows and word counts read lazily for the
// rows that are actually on screen.

import { useEffect, useMemo, useRef, useState } from "react";
import { newDoc, openPaths } from "../app/commands";
import { basename, pathKey } from "../app/paths";
import { useStore, type LibrarySort } from "../app/store";
import {
  countFile,
  countedWords,
  filterByTag,
  formatDate,
  formatWords,
  rows,
  sortRows,
  type Row,
} from "../library/library";
import { filesOf } from "../library/tags";
import "./library.css";

const SORTS: LibrarySort[] = ["modified", "name", "created"];

export function Library() {
  const tree = useStore((s) => s.tree);
  const libraryPath = useStore((s) => s.libraryPath);
  const sort = useStore((s) => s.librarySort);
  const filterTag = useStore((s) => s.libraryFilterTag);
  const tags = useStore((s) => s.tags);
  const docs = useStore((s) => s.docs);

  // Bumped when a word count lands, which is the only thing that changes
  // outside the store.
  const [counted, setCounted] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const list = useMemo(() => {
    const all = sortRows(rows(tree), sort);
    return filterByTag(all, filesOf(tags, filterTag));
  }, [tree, sort, filterTag, tags]);

  // How many files of the tag are not on the list Rust could hand over.
  const cut = useMemo(() => {
    const entry = tags.find((one) => one.tag === filterTag);
    return entry?.truncated ? entry.count - entry.files.length : null;
  }, [tags, filterTag]);

  const dirty = useMemo(() => {
    const set = new Set<string>();
    for (const doc of docs) if (doc.dirty && doc.path) set.add(pathKey(doc.path));
    return set;
  }, [docs]);

  /** Counts a row's words when it comes into view, and once only. */
  useEffect(() => {
    const frame = scroller.current;
    if (!frame) return;
    const bump = () => {
      clearTimeout(pending.current);
      pending.current = setTimeout(() => setCounted((n) => n + 1), 60);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const row = entry.target as HTMLElement;
          const path = row.dataset["path"];
          const mtime = Number(row.dataset["mtime"] ?? 0);
          if (path) void countFile(path, mtime).then((fresh) => fresh && bump());
        }
      },
      { root: frame, rootMargin: "200px" },
    );
    for (const row of frame.querySelectorAll("[data-path]")) observer.observe(row);
    return () => {
      clearTimeout(pending.current);
      observer.disconnect();
    };
  }, [list]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      useStore.getState().closeScreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Only what is on screen counts towards the footer: with a tag filter on,
  // the words of files the filter hid are not part of the answer (§2a).
  // `counted` is read so the dependency is visible, not for its value.
  const words = useMemo(
    () => list.reduce((total, row) => total + (countedWords(row.path, row.mtimeMs) ?? 0), 0),
    [list, counted],
  );

  const open = (row: Row) => {
    useStore.getState().closeScreen();
    void openPaths([row.path]);
  };

  return (
    <div className="library" ref={scroller}>
      <div className="library-head">
        <h1 className="library-title">
          library <span className="is-where">{basename(libraryPath ?? "")}</span>
        </h1>
        <div className="library-sorts">
          {SORTS.map((option) => (
            <button
              key={option}
              className={option === sort ? "is-active" : "link"}
              onClick={() => useStore.getState().setLibrarySort(option)}
            >
              {option}
            </button>
          ))}
          <button className="library-new" onClick={() => newDoc()}>
            + new
          </button>
          <button className="link" onClick={() => useStore.getState().closeScreen()}>
            close
          </button>
        </div>
      </div>

      {filterTag && (
        <div className="library-filter">
          <span className="library-tag">#{filterTag}</span>
          {/* A tag in more files than Rust lists can only be filtered on in
              part, and the screen says so rather than looking complete. */}
          {cut !== null && cut > 0 && <span className="library-more">+{cut} more</span>}
          <button className="link" onClick={() => useStore.getState().toggleLibraryFilter(null)}>
            show all
          </button>
        </div>
      )}

      <div className="library-list">
        {list.length === 0 && <div className="library-empty">no files</div>}
        {list.map((row) => {
          const known = countedWords(row.path, row.mtimeMs);
          return (
            <button
              key={row.path}
              className="library-row"
              data-path={row.path}
              data-mtime={row.mtimeMs}
              onClick={() => open(row)}
            >
              <span className="library-name">
                <span className="library-file">
                  {row.name}
                  {dirty.has(pathKey(row.path)) && <span className="library-edited">edited</span>}
                </span>
                {row.folder && <span className="library-where">{row.folder}</span>}
              </span>
              <span className="library-date">{formatDate(row.mtimeMs)}</span>
              <span className="library-words">{known === null ? "" : formatWords(known)}</span>
            </button>
          );
        })}
      </div>

      <div className="library-foot">
        {list.length === 1 ? "1 file" : `${list.length} files`}
        {words > 0 && ` · ${words.toLocaleString("en-US")} words`}
      </div>
    </div>
  );
}
