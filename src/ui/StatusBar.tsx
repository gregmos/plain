import { Fragment, useEffect, useState } from "react";
import { encodingLabel } from "../app/eol";
import { reopenAs } from "../app/save";
import { countWords } from "../read/words";
import { idle } from "../app/platform";
import { activeDoc, useStore, type Doc } from "../app/store";
import "./dialogs.css";

/** Spec §4, in the order the spec lists them. */
function state(doc: Doc): string {
  if (doc.deleted) return "deleted on disk";
  if (doc.readOnly) return "read-only";
  if (doc.dirty) return "unsaved";
  if (doc.large) return "large file";
  // A buffer that has never been anywhere is not "saved" — there is no file
  // for it to be saved to yet.
  if (doc.path === null) return "new";
  return "saved";
}

/** Above this, edit shows no word count; read still does (see the effect). */
const COUNT_LIMIT = 256 * 1024;

const REOPEN = ["utf-8", "cp1251", "utf-16"];
/** What the status bar calls an encoding vs what Rust wants back. */
const LABELS: Record<string, string> = { cp1251: "windows-1251", "utf-16": "utf-16le" };

export function StatusBar() {
  const message = useStore((s) => s.message);
  const note = useStore((s) => s.note);
  const doc = useStore(activeDoc);
  const resolvedTheme = useStore((s) => s.resolvedTheme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const [menu, setMenu] = useState(false);

  // The menu is a click away from everything else, so anything else closes it.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  useEffect(() => setMenu(false), [doc?.id]);

  // Messages win for their three seconds; otherwise edit shows the caret.
  const caret =
    doc && doc.mode !== "read" && doc.caret
      ? `ln ${doc.caret.line}, col ${doc.caret.col}`
      : null;
  const left = message ?? caret;

  // Wave 3 changes the text on every keystroke, so keep this off that path.
  const text = doc?.text ?? "";
  const large = doc?.large ?? false;
  // Counting parses the whole document — around a second for a megabyte —
  // so it never happens while rendering: the window paints first and the
  // number arrives when the browser is idle. A document past the render gate
  // is past the counting gate entirely (review #14); `large file` stands in
  // for it on the right.
  const [words, setWords] = useState<number | null>(null);

  useEffect(() => {
    // In read the parse is already paid for — the rendered document needed
    // it — so the count is a walk of the tree, tens of milliseconds. In edit
    // nothing else has parsed, and edit hands over new text on every idle
    // flush, so above this size the number is dropped rather than parsing a
    // megabyte between keystrokes (measured: 1 mb ≈ 1 s of parsing, of which
    // the counting itself is ~30 ms).
    const parsed = doc?.mode === "read";
    if (large || text === "" || (!parsed && text.length > COUNT_LIMIT)) {
      setWords(null);
      return;
    }
    let live = true;
    const count = () => {
      if (live) setWords(countWords(text));
    };
    // The word count can wait longer than a text flush can.
    const cancel = idle(count, 2000);
    return () => {
      live = false;
      cancel();
    };
  }, [text, large, doc?.mode]);

  return (
    <div className="statusbar">
      <span className="status-left">{left}</span>
      <span className="status-right">
        {doc && (
          <span className="status-encoding">
            <button
              className="link"
              title="reopen as…"
              onMouseDown={(event) => {
                event.stopPropagation();
                setMenu((open) => !open);
              }}
            >
              {encodingLabel(doc.encoding)}
            </button>
            {menu && (
              <span className="encoding-menu" onMouseDown={(event) => event.stopPropagation()}>
                <span className="sep">reopen as…</span>
                {REOPEN.map((label, index) => (
                  <Fragment key={label}>
                    {index > 0 && <span className="sep">·</span>}
                    <button
                      className="link"
                      onClick={() => {
                        setMenu(false);
                        reopenAs(LABELS[label] ?? label);
                      }}
                    >
                      {label}
                    </button>
                  </Fragment>
                ))}
              </span>
            )}
          </span>
        )}
        {doc && words !== null && (
          <span className="status-words">{words.toLocaleString("en-US")} words</span>
        )}
        {doc && <span>{note ?? state(doc)}</span>}
        <button className="link theme-toggle" title="switch theme" onClick={toggleTheme}>
          {resolvedTheme === "dark" ? "◑ dark" : "◐ light"}
        </button>
      </span>
    </div>
  );
}
