import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { stat } from "@tauri-apps/plugin-fs";
import { openPaths, openPathsInBackground } from "../app/commands";
import { inTauri } from "../app/env";
import { readingPosition, rememberReading } from "../app/session";
import { useStore, type Doc } from "../app/store";
import { allowAssetDir } from "./assets";
import { enhance, revealImage } from "./dom";
import { emitScrollToLine, FIND, GOTO_HEADING, REPLACE, RERENDER } from "./events";
import { FindBar } from "./FindBar";
import {
  folderOf,
  resolveHref,
  resolveWikiLink,
  shortPath,
  type LinkTarget,
} from "./links";
import { setActiveHeading } from "./outline";
import { render } from "./pipeline";
import { readingMinutes } from "./words";
import "katex/dist/katex.min.css";
import "../ui/read.css";

/** Spec §8: above this the document is only built on request. */
const LARGE = 2 * 1024 * 1024;

/** Scroll offsets survive a trip to edit and back (spec §5.0). */
const scrollTops = new Map<string, number>();

// A closed document takes its offset with it: the long-term reading position
// is kept elsewhere (spec §8), this map is only for the trip to edit and back
// (review #16).
useStore.subscribe((state, previous) => {
  if (state.docs.length >= previous.docs.length) return;
  for (const id of scrollTops.keys()) {
    if (!state.docs.some((doc) => doc.id === id)) scrollTops.delete(id);
  }
});

/** A link that carried `#heading` into a document that was not open yet. */
let pendingAnchor: { id: string; hash: string } | null = null;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function formatDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""} ${date.getFullYear()}`;
}

function frontmatterDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function openExternal(url: string): Promise<void> {
  if (!inTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}

async function openInViewer(path: string): Promise<void> {
  if (!inTauri) return;
  const { openPath } = await import("@tauri-apps/plugin-opener");
  await openPath(path);
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* nothing to do; copying is a convenience */
  }
}

export function ReadView({ doc }: { doc: Doc }) {
  const theme = useStore((s) => s.resolvedTheme);
  const libraryPath = useStore((s) => s.libraryPath);

  const [nonce, setNonce] = useState(0);
  const [forced, setForced] = useState(false);
  const [scopeReady, setScopeReady] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findFocus, setFindFocus] = useState(0);
  const [domRevision, setDomRevision] = useState(0);
  const [mtime, setMtime] = useState<Date | null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const topLine = useRef(1);
  const ticking = useRef(false);

  const docId = doc.id;
  const dir = doc.path ? folderOf(doc.path) : null;
  const large = doc.text.length > LARGE;
  const skip = large && !forced;

  // A document that cannot be built must not take the window down with it.
  const built = useMemo(() => {
    if (skip) return null;
    try {
      return { result: render(doc.text), error: null };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : String(error) };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.text, skip, nonce]);

  const result = built?.result ?? null;
  const failure = built?.error ?? null;
  const html = result?.html ?? "";
  const headings = result?.headings;

  /* ------------------------------------------------------------- outline */

  const lines = useMemo(() => {
    const map = new Map<string, number>();
    for (const heading of headings ?? []) map.set(heading.id, heading.line);
    return map;
  }, [headings]);

  useEffect(() => {
    if (headings) useStore.getState().updateDoc(docId, { headings });
  }, [docId, headings]);

  const trackHeading = useCallback(() => {
    const frame = scroller.current;
    const content = body.current;
    if (!frame || !content) return;
    const edge = frame.getBoundingClientRect().top + 8;
    let seen: HTMLElement | null = null;
    for (const heading of content.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6")) {
      if (heading.getBoundingClientRect().top > edge) break;
      seen = heading;
    }
    // Above the first heading the outline still points at it, not at nothing.
    const id = seen?.id ?? content.querySelector("h1,h2,h3,h4,h5,h6")?.id ?? null;
    setActiveHeading(id || null);
    topLine.current = (id ? lines.get(id) : undefined) ?? 1;
    // Where you were reading is remembered per file, LRU 300 (spec §8).
    if (id && doc.path) rememberReading(doc.path, id);
  }, [lines, doc.path]);

  /* --------------------------------------------------------------- scope */

  useEffect(() => {
    setScopeReady(false);
    void Promise.all([allowAssetDir(dir), allowAssetDir(libraryPath)]).then(() =>
      setScopeReady(true),
    );
  }, [dir, libraryPath]);

  /* ---------------------------------------------------------------- meta */

  // Every document asks for itself: `render anyway` is not a session setting.
  useEffect(() => {
    setForced(false);
  }, [docId]);

  useEffect(() => {
    setMtime(null);
    if (!inTauri || !doc.path) return;
    let live = true;
    void stat(doc.path)
      .then((info) => {
        if (live && info.mtime) setMtime(info.mtime);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [doc.path]);

  const meta = useMemo(() => {
    if (!result) return null;
    const date = frontmatterDate(result.frontmatter?.["date"]) ?? mtime;
    const parts = [
      ...(date ? [formatDate(date)] : []),
      `${result.words.toLocaleString("en-US")} words`,
      `${readingMinutes(result.words)} min`,
    ];
    return parts.join(" · ");
  }, [result, mtime]);

  /* ------------------------------------------------------------ the dom */

  // The rendered html is written by hand rather than through
  // `dangerouslySetInnerHTML`: React re-applies that on every update it sees,
  // which would wipe the anchors, highlighting and diagrams added below.
  // Effects run in order, so the html is always in before `enhance` runs.
  // `docId` and `dir` are dependencies even though the markup does not use
  // them: two files can render to the same html, and the previous pass has
  // already resolved its images against the previous folder (review #10).
  useEffect(() => {
    const content = body.current;
    if (content) content.innerHTML = html;
    setDomRevision((value) => value + 1);
  }, [html, docId, dir]);

  useEffect(() => {
    const content = body.current;
    if (!content || !scopeReady || html === "") return;
    const stop = enhance(content, { dir, theme });
    trackHeading();
    // Whatever searches this document searches it after the pass, not before.
    setDomRevision((value) => value + 1);
    return stop;
  }, [html, docId, dir, theme, scopeReady, trackHeading]);

  const scrollToId = useCallback(
    (id: string) => {
      const frame = scroller.current;
      const content = body.current;
      if (!frame || !content || id === "") return false;
      const target = content.querySelector(`[id="${CSS.escape(id)}"]`);
      if (!(target instanceof HTMLElement)) return false;
      frame.scrollTop += target.getBoundingClientRect().top - frame.getBoundingClientRect().top - 8;
      trackHeading();
      return true;
    },
    [trackHeading],
  );

  // Restore the offset for this document, or jump to the heading a link asked
  // for before the file was open.
  useEffect(() => {
    const frame = scroller.current;
    if (!frame) return;
    if (pendingAnchor?.id === docId) {
      const hash = pendingAnchor.hash;
      pendingAnchor = null;
      if (scrollToId(hash)) return;
    }
    const kept = scrollTops.get(docId);
    if (kept !== undefined) {
      frame.scrollTop = kept;
      return;
    }
    // First time this session: pick up where the last one left off (§8).
    const heading = doc.path ? readingPosition(doc.path) : null;
    if (!heading || !scrollToId(heading)) frame.scrollTop = 0;
  }, [docId, doc.path, html, scrollToId]);

  useEffect(() => {
    const onGoto = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id === "string") scrollToId(id);
    };
    const onRerender = () => setNonce((value) => value + 1);
    window.addEventListener(GOTO_HEADING, onGoto);
    window.addEventListener(RERENDER, onRerender);
    return () => {
      window.removeEventListener(GOTO_HEADING, onGoto);
      window.removeEventListener(RERENDER, onRerender);
    };
  }, [scrollToId]);

  // Leaving read for edit lands on the heading that was at the top — the view
  // scrolls, the caret stays where the editor left it (review #7).
  useEffect(() => {
    return () => {
      const state = useStore.getState();
      const still = state.docs.find((item) => item.id === docId);
      if (state.activeId === docId && still?.mode === "edit") {
        emitScrollToLine(topLine.current);
      }
    };
  }, [docId]);

  // The chords live in the command registry; read only answers the events.
  useEffect(() => {
    const onFind = () => {
      setFindOpen(true);
      setFindFocus((value) => value + 1);
    };
    // `Ctrl+H` in read means edit, which is where replacing happens (§5.1).
    const onReplace = () => useStore.getState().setMode("edit");
    window.addEventListener(FIND, onFind);
    window.addEventListener(REPLACE, onReplace);
    return () => {
      window.removeEventListener(FIND, onFind);
      window.removeEventListener(REPLACE, onReplace);
    };
  }, []);

  /* -------------------------------------------------------------- links */

  const targetOf = useCallback(
    (link: HTMLAnchorElement): LinkTarget => {
      const wiki = link.dataset["wiki"];
      if (wiki !== undefined) {
        return resolveWikiLink(wiki, link.dataset["wikiHash"] ?? null, dir);
      }
      return resolveHref(link.getAttribute("href") ?? "", dir);
    },
    [dir],
  );

  const follow = useCallback(
    (link: HTMLAnchorElement, background: boolean) => {
      if (link.classList.contains("is-missing")) return;
      const target = targetOf(link);
      if (target.kind === "external") {
        void openExternal(target.url);
      } else if (target.kind === "anchor") {
        scrollToId(target.id);
      } else if (target.kind === "file") {
        const path = target.path;
        const hash = target.hash;
        void (background ? openPathsInBackground([path]) : openPaths([path])).then((opened) => {
          if (!opened || background) return;
          const id = useStore.getState().activeId;
          if (hash && id) pendingAnchor = { id, hash };
        });
      }
    },
    [targetOf, scrollToId],
  );

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const node = event.target as HTMLElement;

    const placeholder = node.closest<HTMLElement>(".img-holder");
    if (placeholder) {
      event.preventDefault();
      void revealImage(placeholder);
      return;
    }

    const anchor = node.closest<HTMLElement>(".h-anchor");
    if (anchor) {
      event.preventDefault();
      void copy(`#${anchor.dataset["slug"] ?? ""}`);
      useStore.getState().setMessage(`copied #${anchor.dataset["slug"] ?? ""}`);
      return;
    }

    const copyButton = node.closest<HTMLElement>(".code-copy");
    if (copyButton) {
      event.preventDefault();
      const code = copyButton.closest(".codeblock")?.querySelector("code");
      void copy(code?.textContent ?? "");
      useStore.getState().setMessage("copied");
      return;
    }

    const link = node.closest("a");
    if (link instanceof HTMLAnchorElement) {
      event.preventDefault();
      follow(link, event.ctrlKey || event.metaKey);
      return;
    }

    const image = node.closest("img");
    if (image instanceof HTMLImageElement && image.dataset["path"]) {
      event.preventDefault();
      void openInViewer(image.dataset["path"]);
    }
  };

  const onHover = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest("a");
    if (!(link instanceof HTMLAnchorElement)) return;
    const target = targetOf(link);
    const label =
      target.kind === "external"
        ? target.url
        : target.kind === "anchor"
          ? `#${target.id}`
          : target.kind === "file"
            ? shortPath(target.path, libraryPath ?? dir) +
              (link.classList.contains("is-missing") ? " · not found" : "")
            : "";
    if (label) useStore.getState().setMessage(label);
  };

  /* ------------------------------------------------------------- render */

  return (
    <>
      {findOpen && (
        <FindBar
          container={scroller.current}
          revision={domRevision}
          focusToken={findFocus}
          onClose={() => setFindOpen(false)}
        />
      )}
      <div
        className="content read"
        ref={scroller}
        onScroll={() => {
          const frame = scroller.current;
          if (frame) scrollTops.set(docId, frame.scrollTop);
          if (ticking.current) return;
          ticking.current = true;
          requestAnimationFrame(() => {
            ticking.current = false;
            trackHeading();
          });
        }}
      >
        <div className="read-column">
          {skip ? (
            <div className="read-large">
              <p>this file is larger than 2 mb, so it was not rendered.</p>
              <button className="link" onClick={() => setForced(true)}>
                render anyway
              </button>
            </div>
          ) : failure ? (
            <div className="read-large">
              <p>couldn't build this document — {failure}</p>
              <button className="link" onClick={() => useStore.getState().setMode("edit")}>
                open the source
              </button>
            </div>
          ) : (
            <>
              {meta && <div className="read-meta">{meta}</div>}
              <div className="read-html" ref={body} onClick={onClick} onMouseOver={onHover} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
