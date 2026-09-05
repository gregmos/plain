import { useCallback, useEffect, useState } from "react";
import { deleteSnapshot, listSnapshots, openSnapshot, type Snapshot } from "../app/history";
import { restoreSnapshot } from "../app/save";
import { normalizeEol } from "../app/eol";
import { readFile } from "../app/fs";
import { activeDoc, useStore } from "../app/store";
import "./dialogs.css";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function when(at: number): string {
  const date = new Date(at);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ""} ${date.getFullYear()} · ${hh}:${mm}`;
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} b`;
  return `${Math.round(bytes / 102.4) / 10} kb`;
}

/** `file → version history…` (spec §2a): the snapshots of one document. */
export function HistoryScreen({ id }: { id: string }) {
  const doc = useStore((s) => s.docs.find((d) => d.id === id));
  const setHistory = useStore((s) => s.setHistory);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);

  const reload = useCallback(() => {
    if (!doc) return;
    void listSnapshots(doc).then(setSnapshots);
  }, [doc]);

  useEffect(reload, [reload]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setHistory(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setHistory]);

  if (!doc) return null;

  const confirm = (title: string, lines: string[], label: string, run: () => void) => {
    const store = useStore.getState();
    store.setDialog({
      title,
      lines,
      actions: [
        {
          label,
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

  const compare = (snapshot: Snapshot) => {
    void (async () => {
      try {
        const info = await readFile(snapshot.path);
        const live = activeDoc(useStore.getState());
        useStore.getState().setComparison({
          id,
          leftLabel: "snapshot",
          left: normalizeEol(info.text),
          rightLabel: "buffer",
          right: normalizeEol((live?.id === id ? live : doc).text),
          takeLabel: "take snapshot",
          fromDisk: false,
        });
      } catch {
        useStore.getState().setMessage("couldn't read that snapshot");
      }
    })();
  };

  return (
    <div className="screen">
      <div className="screen-column">
        <div className="screen-title">version history</div>
        <div className="screen-lead">
          {doc.title} · kept for thirty days, one copy every five minutes of saving. restoring
          only changes the buffer — the file is written when you save.
        </div>

        {snapshots === null ? (
          <div className="screen-empty">reading…</div>
        ) : snapshots.length === 0 ? (
          <div className="screen-empty">nothing saved from here yet</div>
        ) : (
          snapshots.map((snapshot) => (
            <div className="screen-row" key={snapshot.path}>
              <span className="screen-name">{when(snapshot.takenAt)}</span>
              <span className="screen-size">{size(snapshot.size)}</span>
              <span className="screen-row-actions">
                <button
                  className="link"
                  onClick={() =>
                    confirm(
                      "restore this version?",
                      [`${doc.title} goes back to ${when(snapshot.takenAt)}.`,
                       "what the buffer holds now is kept as a version of its own."],
                      "restore",
                      () => {
                        void restoreSnapshot(id, snapshot.path).then((done) => {
                          if (done) setHistory(null);
                        });
                      },
                    )
                  }
                >
                  restore
                </button>
                <span className="sep">·</span>
                <button className="link" onClick={() => compare(snapshot)}>
                  compare
                </button>
                <span className="sep">·</span>
                <button
                  className="link"
                  onClick={() => void openSnapshot(doc.title, snapshot).then(() => setHistory(null))}
                >
                  open
                </button>
                <span className="sep">·</span>
                <button
                  className="link"
                  onClick={() =>
                    confirm(
                      "delete this version?",
                      [`${when(snapshot.takenAt)} · ${size(snapshot.size)}`],
                      "delete",
                      () => {
                        void deleteSnapshot(snapshot).then((gone) => gone && reload());
                      },
                    )
                  }
                >
                  delete
                </button>
              </span>
            </div>
          ))
        )}

        <div className="screen-actions">
          <button className="link" onClick={() => setHistory(null)}>
            close
          </button>
        </div>
      </div>
    </div>
  );
}
