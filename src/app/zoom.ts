// WebView2 keeps its own Ctrl+=/-/0 (spec §5.1, §12). The view menu cannot
// reach that, so its three items drive the same factor by hand.

import { getCurrentWebview } from "@tauri-apps/api/webview";
import { inTauri } from "./env";
import { useStore } from "./store";

const STEP = 0.1;
const MIN = 0.5;
const MAX = 2;

function apply(zoom: number): void {
  // 1.1 + 0.1 is 1.2000000000000002; the status message would show it.
  const next = Math.round(Math.min(MAX, Math.max(MIN, zoom)) * 10) / 10;
  const store = useStore.getState();
  store.setZoom(next);
  store.setMessage(`zoom ${Math.round(next * 100)}%`);
  if (inTauri) {
    void getCurrentWebview()
      .setZoom(next)
      .catch(() => store.setMessage("zoom is not available"));
  }
}

export function zoomIn(): void {
  apply(useStore.getState().zoom + STEP);
}

export function zoomOut(): void {
  apply(useStore.getState().zoom - STEP);
}

export function zoomReset(): void {
  apply(1);
}
