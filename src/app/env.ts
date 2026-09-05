// The UI also has to render in a plain browser during `vite dev`, so every
// Tauri call goes behind this flag.
export const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
