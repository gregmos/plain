import { useEffect, type CSSProperties } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Banner } from "../ui/Banner";
import { DocView } from "../ui/DocView";
import { Empty } from "../ui/Empty";
import { FolderSearch } from "../ui/FolderSearch";
import { MenuBar } from "../ui/MenuBar";
import { Modal } from "../ui/Modal";
import { ModeBar } from "../ui/ModeBar";
import { QuickSearch } from "../ui/QuickSearch";
import { Rail } from "../ui/Rail";
import { RailResizer } from "../ui/Resizer";
import { RecoveryScreen } from "../ui/Recovery";
import { SettingsScreen } from "../ui/Settings";
import { ShortcutsScreen } from "../ui/Shortcuts";
import { StatusBar } from "../ui/StatusBar";
import "../ui/app.css";
import { installCloseGuard } from "./close";
import { installDrafts } from "./drafts";
import { DiffScreen } from "../ui/Diff";
import { HistoryScreen } from "../ui/History";
import { inTauri } from "./env";
import { installKeys } from "./keys";
import { installDrop } from "../library/dnd";
import { installTree } from "../library/tree";
import { installTags } from "../library/tags";
import { installBacklinks } from "../library/backlinks";
import { installLibraryCounts } from "../library/library";
import { Library } from "../ui/Library";
import { installAutosave } from "./save";
import { installSession } from "./session";
import { activeDoc, useStore, type Comparison, type Screen } from "./store";
import { watchSystemTheme } from "./theme";
import { installWatcher } from "./watcher";


/**
 * Anything on screen that already means something by `Esc`: a modal, a
 * screen that closes, a search that cancels, a panel inside the editor.
 * While one of these is up, `Esc` belongs to it and to nothing else.
 */
function escapeIsTaken(): boolean {
  const store = useStore.getState();
  return Boolean(
    store.dialog ||
      store.recovery ||
      // Every screen over the document answers `Esc` by closing.
      store.screen !== null ||
      store.quickSearch !== null ||
      // The read find bar and CodeMirror's own panels close on `Esc` too.
      document.querySelector(".findbar, .cm-panel"),
  );
}

/**
 * Exactly one screen, chosen by the one piece of state that says which. The
 * data screens fall through to nothing if their data went before they did.
 */
function ScreenView({
  screen,
  history,
  comparison,
}: {
  screen: Screen;
  history: string | null;
  comparison: Comparison | null;
}) {
  switch (screen) {
    case "settings":
      return <SettingsScreen />;
    case "shortcuts":
      return <ShortcutsScreen />;
    case "folderSearch":
      return <FolderSearch />;
    case "library":
      return <Library />;
    case "comparison":
      return comparison ? <DiffScreen comparison={comparison} /> : null;
    case "history":
      return history ? <HistoryScreen id={history} /> : null;
  }
}

export function App() {
  const railCollapsed = useStore((s) => s.railCollapsed);
  const railWidth = useStore((s) => s.railWidth);
  const banner = useStore((s) => s.banner);
  const recovery = useStore((s) => s.recovery);
  const screen = useStore((s) => s.screen);
  const history = useStore((s) => s.history);
  const comparison = useStore((s) => s.comparison);
  const searching = useStore((s) => s.quickSearch !== null);
  const focus = useStore((s) => s.focus);
  const doc = useStore(activeDoc);

  useEffect(() => installKeys(), []);
  useEffect(() => installDrafts(), []);
  useEffect(() => installSession(), []);
  useEffect(() => installAutosave(), []);
  useEffect(() => installWatcher(), []);
  useEffect(() => installCloseGuard(), []);
  useEffect(() => installTree(), []);
  useEffect(() => installDrop(), []);
  useEffect(() => installTags(), []);
  useEffect(() => installBacklinks(), []);
  useEffect(() => installLibraryCounts(), []);

  useEffect(
    () => watchSystemTheme((resolved) => useStore.getState().syncSystemTheme(resolved)),
    [],
  );

  // Focus mode (spec §2a): `Esc` leaves it, but only once nothing else wants
  // that key. Everything that answers `Esc` first is listed in one place, so
  // adding a screen cannot quietly make one `Esc` do two things (review #17).
  useEffect(() => {
    if (!focus) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (escapeIsTaken()) return;
      useStore.getState().setFocus(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  // Spec §3: the dirty marker also shows in the window title.
  useEffect(() => {
    if (!inTauri) return;
    const title = doc ? `${doc.title}${doc.dirty ? " •" : ""} — Plain` : "Plain";
    void getCurrentWindow().setTitle(title);
  }, [doc]);

  return (
    <div
      className={"app" + (searching ? " is-searching" : "") + (focus ? " is-focus" : "")}
      // The dragged rail width lives here, so the rail and the strip that
      // resizes it read the same number (spec §4).
      style={{ "--rail-w": `${railWidth}px` } as CSSProperties}
    >
      <MenuBar />
      <div className="app-body">
        {!railCollapsed && (
          <>
            <Rail />
            <RailResizer />
          </>
        )}
        <div className="main">
          <ModeBar />
          {banner && <Banner banner={banner} />}
          {recovery && recovery.length > 0 ? (
            <RecoveryScreen entries={recovery} />
          ) : screen ? (
            <ScreenView screen={screen} history={history} comparison={comparison} />
          ) : doc ? (
            <DocView doc={doc} />
          ) : (
            <Empty />
          )}
          <StatusBar />
        </div>
      </div>
      <Modal />
      <QuickSearch />
    </div>
  );
}
