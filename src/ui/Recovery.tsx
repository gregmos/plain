import { recoveryDone } from "../app/bootstrap";
import { discardDraft, restoreDraft } from "../app/drafts";
import { dirname } from "../app/paths";
import { showConflict } from "../app/save";
import { useStore, type Recovery as Entry } from "../app/store";
import "./dialogs.css";

function ago(at: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

/** Shown at startup when %APPDATA%\Plain\drafts is not empty (spec §8). */
export function RecoveryScreen({ entries }: { entries: Entry[] }) {
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

  const discard = (entry: Entry) => {
    void discardDraft(entry);
    take(entry);
  };

  return (
    <div className="screen">
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
          <button
            className="link"
            onClick={() => {
              for (const entry of entries) void discardDraft(entry);
              recoveryDone();
            }}
          >
            discard all
          </button>
        </div>
      </div>
    </div>
  );
}
