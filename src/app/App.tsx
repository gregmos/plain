import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Banner } from "../ui/Banner";
import { DocView } from "../ui/DocView";
import { Empty } from "../ui/Empty";
import { Modal } from "../ui/Modal";
import { ModeBar } from "../ui/ModeBar";
import { Rail } from "../ui/Rail";
import { RecoveryScreen } from "../ui/Recovery";
import { StatusBar } from "../ui/StatusBar";
import "../ui/app.css";
import { installCloseGuard } from "./close";
import { installDrafts } from "./drafts";
import { inTauri } from "./env";
import { installKeys } from "./keys";
import { installSession } from "./session";
import { activeDoc, useStore } from "./store";
import { watchSystemTheme } from "./theme";
import { installWatcher } from "./watcher";

export function App() {
  const railCollapsed = useStore((s) => s.railCollapsed);
  const banner = useStore((s) => s.banner);
  const recovery = useStore((s) => s.recovery);
  const doc = useStore(activeDoc);

  useEffect(() => installKeys(), []);
  useEffect(() => installDrafts(), []);
  useEffect(() => installSession(), []);
  useEffect(() => installWatcher(), []);
  useEffect(() => installCloseGuard(), []);

  useEffect(
    () => watchSystemTheme((resolved) => useStore.getState().syncSystemTheme(resolved)),
    [],
  );

  // Spec §3: the dirty marker also shows in the window title.
  useEffect(() => {
    if (!inTauri) return;
    const title = doc ? `${doc.title}${doc.dirty ? " •" : ""} — Plain` : "Plain";
    void getCurrentWindow().setTitle(title);
  }, [doc]);

  return (
    <div className="app">
      <div className="app-body">
        {!railCollapsed && <Rail />}
        <div className="main">
          <ModeBar />
          {banner && <Banner banner={banner} />}
          {recovery && recovery.length > 0 ? (
            <RecoveryScreen entries={recovery} />
          ) : doc ? (
            <DocView doc={doc} />
          ) : (
            <Empty />
          )}
          <StatusBar />
        </div>
      </div>
      <Modal />
    </div>
  );
}
