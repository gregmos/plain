import { Fragment, useEffect, useRef } from "react";
import { useStore } from "../app/store";
import "./dialogs.css";

/** The app's only dialog: 420px, text actions, `Esc` cancels (spec §4). */
export function Modal() {
  const dialog = useStore((s) => s.dialog);
  const box = useRef<HTMLDivElement>(null);
  const focusWas = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!dialog) return;
    focusWas.current = document.activeElement as HTMLElement | null;
    const buttons = () =>
      Array.from(box.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);

    // The safe answer takes the focus, and the safe answer is the last one
    // unless the dialog says otherwise: every dialog here ends in `cancel`,
    // and a dialog that opens under a keystroke must not answer `delete` to
    // the `Enter` that follows.
    const list = buttons();
    const named = dialog.safe
      ? list.find((button) => button.textContent === dialog.safe)
      : undefined;
    (named ?? list[list.length - 1])?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dialog.cancel();
        return;
      }
      if (event.key !== "Tab") return;
      // Nothing behind the dialog is reachable while it is up, so `Tab`
      // goes round its own buttons instead of wandering off into the
      // document underneath.
      const round = buttons();
      if (round.length === 0) return;
      event.preventDefault();
      const at = round.indexOf(document.activeElement as HTMLButtonElement);
      const step = event.shiftKey ? -1 : 1;
      round[(at + step + round.length) % round.length]?.focus();
    };

    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      const back = focusWas.current;
      focusWas.current = null;
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
  }, [dialog]);

  if (!dialog) return null;

  return (
    <div className="scrim" onMouseDown={dialog.cancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal
        ref={box}
        onMouseDown={(e) => e.stopPropagation()}
      >
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
              <button className="link" onClick={action.run}>
                {action.label}
              </button>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
