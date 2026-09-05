// Search inside the library (spec §7): a screen in the style of the library
// instead of the document. One Rust call per question, results grouped by
// file, a click lands on the line in edit.

import { useEffect, useMemo, useRef, useState } from "react";
import { openInEdit } from "../app/commands";
import { basename } from "../app/paths";
import { emitGotoLine } from "../read/events";
import { useStore } from "../app/store";
import { runner, type LineMatch, type SearchAnswer } from "../library/search";
import "./library.css";

/** `notes/ideas.md` -> `notes`; a file in the root has nothing to add. */
function folderOf(rel: string): string {
  const at = rel.lastIndexOf("/");
  return at < 0 ? "" : rel.slice(0, at);
}

/** The matched parts of a context line, painted with the accent. */
function Line({ match }: { match: LineMatch }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  match.ranges.forEach(([from, to], index) => {
    if (from > at) parts.push(match.text.slice(at, from));
    parts.push(<mark key={index}>{match.text.slice(from, to)}</mark>);
    at = to;
  });
  if (at < match.text.length) parts.push(match.text.slice(at));
  return <span className="folder-search-text">{parts}</span>;
}

export function FolderSearch() {
  const libraryPath = useStore((s) => s.libraryPath);
  const extensions = useStore((s) => s.settings.library.extensions);

  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [answer, setAnswer] = useState<SearchAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const ask = useMemo(
    () =>
      runner(
        (result) => {
          setError(null);
          setAnswer(result);
        },
        (message) => {
          setError(message);
          setAnswer(null);
        },
      ),
    [],
  );

  useEffect(() => () => ask.stop(), [ask]);
  useEffect(() => input.current?.focus(), []);

  // `Esc` goes back to the document from anywhere on the screen (spec §7).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      useStore.getState().setFolderSearch(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!libraryPath) return;
    ask.run({ root: libraryPath, query, caseSensitive, regex, extensions });
  }, [ask, libraryPath, query, caseSensitive, regex, extensions]);

  const close = () => useStore.getState().setFolderSearch(false);

  const lines = answer?.files.reduce((total, file) => total + file.matches.length, 0) ?? 0;

  const note = (): string | null => {
    if (error) return error;
    if (query.trim() === "") return null;
    if (!answer) return null;
    const parts = [
      lines === 0
        ? "no matches"
        : `${lines} ${lines === 1 ? "line" : "lines"} in ${answer.files.length} ${
            answer.files.length === 1 ? "file" : "files"
          }`,
    ];
    if (answer.truncated) parts.push("showing the first of them");
    if (answer.skippedLarge > 0) {
      parts.push(`${answer.skippedLarge} files over 2 mb skipped`);
    }
    if (answer.skippedUnreadable > 0) {
      parts.push(`${answer.skippedUnreadable} files could not be read`);
    }
    return parts.join(" · ");
  };

  return (
    <div className="folder-search">
      <h1 className="folder-search-title">
        search in <span className="is-where">{basename(libraryPath ?? "")}</span>
      </h1>

      <div className="folder-search-field">
        <span className="qs-glyph">⌕</span>
        <input
          ref={input}
          className="folder-search-input"
          value={query}
          placeholder="find in files"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className={"glyph-toggle" + (caseSensitive ? " is-active" : "")}
          title="match case"
          onClick={() => setCaseSensitive((value) => !value)}
        >
          Aa
        </button>
        <button
          className={"glyph-toggle" + (regex ? " is-active" : "")}
          title="regular expression"
          onClick={() => setRegex((value) => !value)}
        >
          .*
        </button>
        <button className="link" onClick={close}>
          close
        </button>
      </div>

      {note() && <div className="folder-search-note">{note()}</div>}

      {answer?.files.map((file) => (
        <div key={file.path}>
          <div className="folder-search-file">
            <span className="folder-search-name">{file.name}</span>
            <span className="folder-search-where">{folderOf(file.rel)}</span>
          </div>
          {file.matches.map((match) => (
            <button
              key={`${match.line}`}
              className="folder-search-line"
              onClick={() => {
                // The screen has the content area, so it has to step aside
                // before the line it points at can be shown.
                void openInEdit(file.path).then(() => {
                  useStore.getState().setFolderSearch(false);
                  // A frame later the editor is mounted and measured, so the
                  // jump scrolls instead of only moving the caret.
                  requestAnimationFrame(() => emitGotoLine(match.line));
                });
              }}
            >
              <span className="folder-search-no">{match.line}</span>
              <Line match={match} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
