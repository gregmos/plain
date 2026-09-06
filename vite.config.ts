import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The about dialog asks Tauri for the version at runtime; in a browser there
// is no Tauri to ask, so the number comes from package.json at build time.
const { version } = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

// Tauri drives this dev server; the port is fixed and must not wander.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    // WebView2 on Windows 11 is evergreen Chromium.
    target: "chrome120",
    sourcemap: false,
  },
  test: {
    // The suite must answer the same on every host: the setup file pins the
    // platform to Windows, and the macOS cases opt in (spec §13a).
    setupFiles: ["./vitest.setup.ts"],
  },
});
