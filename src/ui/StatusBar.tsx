import { Fragment, useEffect, useMemo, useState } from "react";
import { encodingLabel } from "../app/eol";
import { reopenAs } from "../app/save";
import { countWords } from "../read/words";
import { activeDoc, useStore, type Doc } from "../app/store";
import "./dialogs.css";

/** Spec §4, in the order the spec lists them. */
function state(doc: Doc): string {
  if (doc.deleted) return "deleted on disk";
  if (doc.readOnly) return "read-only";
  if (doc.dirty) return "unsaved";
  if (doc.large) return "large file";
  return "saved";
}

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
    doc?.mode === "edit" && doc.caret ? `ln ${doc.caret.line}, col ${doc.caret.col}` : null;
  const left = message ?? caret;

  // Wave 3 changes the text on every keystroke, so keep this off that path.
  const text = doc?.text ?? "";
  const words = useMemo(() => countWords(text), [text]);

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
        {doc && <span className="status-words">{words.toLocaleString("en-US")} words</span>}
        {doc && <span>{note ?? state(doc)}</span>}
        <button className="link theme-toggle" onClick={toggleTheme}>
          {resolvedTheme === "dark" ? "◑ dark" : "◐ light"}
        </button>
      </span>
    </div>
  );
}
