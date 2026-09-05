import { useEffect } from "react";
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
import { activeDoc, useStore } from "./store";
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
      store.settingsOpen ||
      store.shortcutsOpen ||
      store.libraryOpen ||
      store.history ||
      store.comparison ||
      store.quickSearch !== null ||
      store.folderSearch ||
      // The read find bar and CodeMirror's own panels close on `Esc` too.
      document.querySelector(".findbar, .cm-panel"),
  );
}

export function App() {
  const railCollapsed = useStore((s) => s.railCollapsed);
  const banner = useStore((s) => s.banner);
  const recovery = useStore((s) => s.recovery);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const shortcutsOpen = useStore((s) => s.shortcutsOpen);
  const folderSearch = useStore((s) => s.folderSearch);
  const libraryOpen = useStore((s) => s.libraryOpen);
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
    <div className={"app" + (searching ? " is-searching" : "") + (focus ? " is-focus" : "")}>
      <MenuBar />
      <div className="app-body">
        {!railCollapsed && <Rail />}
        <div className="main">
          <ModeBar />
          {banner && <Banner banner={banner} />}
          {recovery && recovery.length > 0 ? (
            <RecoveryScreen entries={recovery} />
          ) : settingsOpen ? (
            <SettingsScreen />
          ) : shortcutsOpen ? (
            <ShortcutsScreen />
          ) : folderSearch ? (
            <FolderSearch />
          ) : libraryOpen ? (
            <Library />
          ) : comparison ? (
            <DiffScreen comparison={comparison} />
          ) : history ? (
            <HistoryScreen id={history} />
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
