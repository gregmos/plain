import { Fragment, useEffect, useRef } from "react";
import { useStore } from "../app/store";
import "./dialogs.css";

/** The app's only dialog: 420px, text actions, `Esc` cancels (spec §4). */
export function Modal() {
  const dialog = useStore((s) => s.dialog);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!dialog) return;
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dialog.cancel();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [dialog]);

  if (!dialog) return null;

  return (
    <div className="scrim" onMouseDown={dialog.cancel}>
      <div className="modal" role="dialog" aria-modal onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-title">{dialog.title}</div>
        {dialog.lines && dialog.lines.length > 0 && (
          <div className="modal-lines">
            {dialog.lines.map((line) => (
              <div
                className={/[\\/]/.test(line) ? "modal-line is-path" : "modal-line"}
                key={line}
                title={line}
              >
                {line}
              </div>
            ))}
          </div>
        )}
        <div className="modal-actions">
          {dialog.actions.map((action, index) => (
            <Fragment key={action.label}>
              {index > 0 && <span className="sep">·</span>}
              <button className="link" ref={index === 0 ? first : undefined} onClick={action.run}>
                {action.label}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
