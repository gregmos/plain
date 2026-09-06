import { recoveryDone } from "../app/bootstrap";
import { deferDraft, discardDraft, restoreDraft } from "../app/drafts";
import { dirname } from "../app/paths";
import { showConflict } from "../app/save";
import { useStore, type Recovery as Entry } from "../app/store";
import "./dialogs.css";
import { useScreenFocus } from "./screen";

function ago(at: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

/** Shown at startup when %APPDATA%\Plain\drafts is not empty (spec §8). */
export function RecoveryScreen({ entries }: { entries: Entry[] }) {
  const scroller = useScreenFocus<HTMLDivElement>();
  const setRecovery = useStore((s) => s.setRecovery);

  const take = (entry: Entry) => {
    const left = entries.filter((e) => e.file !== entry.file);
    // The last answer releases the session restore that was waiting.
    if (left.length === 0) recoveryDone();
    else setRecovery(left);
  };

  // The document has to exist before the session restore opens the same path
  // from disk, or the recovered text is the one that loses.
  const restore = async (entry: Entry) => {
    const outcome = await restoreDraft(entry);
    if (outcome?.conflict) showConflict(outcome.id);
    take(entry);
  };

  /** Throwing away unsaved text is asked about once, and `cancel` is safe. */
  const confirm = (title: string, lines: string[], run: () => void) => {
    const store = useStore.getState();
    store.setDialog({
      title,
      lines,
      safe: "cancel",
      actions: [
        {
          label: "discard",
          run: () => {
            store.setDialog(null);
            run();
          },
        },
        { label: "cancel", run: () => store.setDialog(null) },
      ],
      cancel: () => store.setDialog(null),
    });
  };

  // A discard that could not reach the Recycle Bin leaves the row alone, so
  // the text stays reachable (spec §8).
  const discard = (entry: Entry) => {
    confirm(`discard ${entry.title}?`, ["it goes to the recycle bin."], () => {
      void discardDraft(entry).then((gone) => {
        if (gone) take(entry);
      });
    });
  };

  const discardAll = () => {
    confirm(
      entries.length === 1 ? "discard 1 draft?" : `discard ${entries.length} drafts?`,
      ["they go to the recycle bin."],
      () => {
        void (async () => {
          const left: Entry[] = [];
          for (const entry of entries) {
            if (!(await discardDraft(entry))) left.push(entry);
          }
          // Whatever the Recycle Bin refused stays on the screen.
          if (left.length > 0) setRecovery(left);
          else recoveryDone();
        })();
      },
    );
  };

  return (
    <div className="screen" tabIndex={0} ref={scroller}>
      <div className="screen-column">
        <div className="screen-title">unsaved work found</div>
        <div className="screen-lead">
          plain was closed with edits that never reached the disk. discarded drafts go to the
          recycle bin.
        </div>

        {entries.map((entry) => (
          <div className="screen-row" key={entry.file}>
            <span className="screen-name">{entry.title}</span>
            <span className="screen-where" title={entry.path ?? "never saved"}>
              {entry.path ? dirname(entry.path) : "never saved"}
            </span>
            <span className="screen-when">{ago(entry.savedAt)}</span>
            <span className="screen-row-actions">
              <button className="link" onClick={() => void restore(entry)}>
                restore
              </button>
              <span className="sep">·</span>
              <button className="link" onClick={() => discard(entry)}>
                discard
              </button>
            </span>
          </div>
        ))}

        <div className="screen-actions">
          <button
            className="link"
            onClick={() => {
              void (async () => {
                for (const entry of entries) {
                  const outcome = await restoreDraft(entry);
                  if (outcome?.conflict) showConflict(outcome.id);
                }
                recoveryDone();
              })();
            }}
          >
            restore all
          </button>
          <span className="sep">·</span>
          <button className="link" onClick={discardAll}>
            discard all
          </button>
          <span className="sep">·</span>
          {/* Neither restore nor discard. They are moved aside first: under
              their working name the session about to start would overwrite or
              delete them without anyone choosing (review w11 #1). */}
          <button
            className="link"
            onClick={() => {
              void (async () => {
                for (const entry of entries) await deferDraft(entry);
                recoveryDone();
              })();
            }}
          >
            later
          </button>
        </div>
      </div>
    </div>
  );
}
