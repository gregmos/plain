// Search inside the library (spec §7): a screen in the style of the library
// instead of the document. One Rust call per question, results grouped by
// file, a click lands on the line in edit.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openPaths } from "../app/commands";
import { basename } from "../app/paths";
import { emitGotoLine } from "../read/events";
import { activeDoc, useStore } from "../app/store";
import {
  hits,
  openPlan,
  handlesKey,
  runner,
  step,
  type Hit,
  type LineMatch,
  type SearchAnswer,
} from "../library/search";
import { OPEN_IN_EDIT } from "./QuickSearch";
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
  const [at, setAt] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const screen = useRef<HTMLDivElement>(null);

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
      useStore.getState().closeScreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!libraryPath) return;
    ask.run({ root: libraryPath, query, caseSensitive, regex, extensions });
  }, [ask, libraryPath, query, caseSensitive, regex, extensions]);

  const found = useMemo(() => hits(answer), [answer]);

  // A new answer is a new list; start at its first line.
  useEffect(() => setAt(found.length > 0 ? 0 : -1), [found]);

  /** Opens one result the way `Enter` or `Ctrl+Enter` asks for (spec §7). */
  const open = useCallback((hit: Hit | undefined, withCtrl: boolean) => {
    if (!hit) return;
    const doc = activeDoc(useStore.getState());
    const plan = openPlan(doc?.mode ?? null, withCtrl);
    // The screen has the content area, so it has to step aside before the
    // line it points at can be shown.
    void openPaths([hit.path]).then((opened) => {
      if (!opened) return;
      useStore.getState().setMode(plan.mode);
      useStore.getState().closeScreen();
      // A frame later the editor is mounted and measured, so the jump
      // scrolls instead of only moving the caret.
      if (plan.jump) requestAnimationFrame(() => emitGotoLine(hit.line));
    });
  }, []);

  /**
   * `↑`/`↓` walk the results and `Enter` opens one. This listens on the
   * screen rather than on `window`, so a key aimed at a toggle, at a dialog
   * on top, or at quick search is not answered here as well (review #3).
   */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const store = useStore.getState();
    const target = event.target as HTMLElement | null;
    const handled = handlesKey(event.key, {
      defaultPrevented: event.defaultPrevented,
      onControl: Boolean(target?.closest("button")),
      blocked: store.dialog !== null || store.quickSearch !== null,
    });
    if (!handled) return;

    event.preventDefault();
    if (event.key === "Enter") {
      open(found[at], event.ctrlKey || event.metaKey);
      return;
    }
    setAt((current) => step(current, event.key === "ArrowDown" ? 1 : -1, found.length));
  };

  // Keep the chosen line on screen while the arrows walk past the fold.
  useEffect(() => {
    if (at < 0) return;
    screen.current
      ?.querySelector(`[data-hit="${at}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [at]);

  const close = () => useStore.getState().closeScreen();

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
    <div className="folder-search" ref={screen} onKeyDown={onKeyDown}>
      <div className="screen-head">
        <h1 className="folder-search-title">
          search in <span className="is-where">{basename(libraryPath ?? "")}</span>
        </h1>
        <button className="link" onClick={close}>
          close
        </button>
      </div>

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
      </div>

      {note() && <div className="folder-search-note">{note()}</div>}

      {answer?.files.map((file) => (
        <div key={file.path}>
          <div className="folder-search-file">
            <span className="folder-search-name">{file.name}</span>
            <span className="folder-search-where">{folderOf(file.rel)}</span>
          </div>
          {file.matches.map((match) => {
            const index = found.findIndex(
              (hit) => hit.path === file.path && hit.line === match.line,
            );
            return (
            <button
              key={`${match.line}`}
              data-hit={index}
              className={"folder-search-line" + (index === at ? " is-selected" : "")}
              onClick={(event) => open(found[index], event.ctrlKey || event.metaKey)}
            >
              <span className="folder-search-no">{match.line}</span>
              <Line match={match} />
            </button>
            );
          })}
        </div>
      ))}

      {found.length > 0 && (
        <div className="folder-search-foot">
          <span>↑↓ move</span>
          <span>↵ open</span>
          <span>{OPEN_IN_EDIT} open in edit</span>
        </div>
      )}
    </div>
  );
}
