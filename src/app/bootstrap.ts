// Startup: settings, then the paths this launch was asked to open.

import { listen } from "@tauri-apps/api/event";
import { drainPendingPaths } from "./commands";
import { inTauri } from "./env";
import { loadSettings } from "./settings";
import { useStore } from "./store";

export async function bootstrap(): Promise<void> {
  const { settings, invalid } = await loadSettings();
  const store = useStore.getState();
  store.applySettings(settings);
  if (invalid) {
    store.showBanner({
      id: "settings",
      text: "settings.json is invalid",
      actions: [{ label: "dismiss", run: () => useStore.getState().dismissBanner("settings") }],
    });
  }

  if (!inTauri) return;

  // Listener first, then drain: a second launch can signal at any moment, and
  // the event is only a nudge to read the queue — the paths live in Rust.
  await listen("open-path", () => void drainPendingPaths());
  await drainPendingPaths();
}
