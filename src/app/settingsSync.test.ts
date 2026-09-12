// settings.json is one file for the whole app, so a value changed in one
// window has to take in all of them — and the window that hears about it must
// not write its own older snapshot back over the top (W13 §7, M4).

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn(async (command: string, _args?: unknown) =>
  command === "data_path" ? "C:/data" : null,
);
const emit = vi.fn(async (_name: string, _payload: unknown) => undefined);
const listeners: Record<string, (event: { payload: unknown }) => void> = {};

vi.mock("./env", () => ({ inTauri: true }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (c: string, a?: unknown) => invoke(c, a) }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: (name: string, payload: unknown) => emit(name, payload),
  listen: async (name: string, handler: (event: { payload: unknown }) => void) => {
    listeners[name] = handler;
    return () => delete listeners[name];
  },
}));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: "main" }) }));
vi.mock("@tauri-apps/api/path", () => ({
  join: async (...parts: string[]) => parts.join("/"),
  appDataDir: async () => "C:/data",
}));

const { DEFAULTS, flushSettings, saveSettings } = await import("./settings");
const { installSettingsSync, settingsLoaded } = await import("./windows");
const { useStore } = await import("./store");

const CHANGED = { ...DEFAULTS, appearance: { ...DEFAULTS.appearance, theme: "dark" as const } };

/** Was settings.json written since the last check? */
const wrote = () => invoke.mock.calls.some((call) => call[0] === "write_text_atomic");

function sent(from: string): void {
  listeners["plain:settings-changed"]?.({ payload: { from, settings: CHANGED } });
}

beforeEach(async () => {
  invoke.mockClear();
  emit.mockClear();
  useStore.getState().applySettings(DEFAULTS);
  await installSettingsSync();
  // The startup read is over; events are applied as they come.
  settingsLoaded();
});

describe("settings changed in another window", () => {
  it("are applied here, and not written again from here", async () => {
    sent("w2");

    expect(useStore.getState().settings.appearance.theme).toBe("dark");
    await flushSettings();
    expect(wrote()).toBe(false);
  });

  /**
   * The window may have been a click away from writing the value it had
   * before it heard; that write would put the old theme back (W13 §7.2).
   */
  it("drop the write this window still had waiting", async () => {
    saveSettings({ ...DEFAULTS, appearance: { ...DEFAULTS.appearance, fontSize: 19 } });
    sent("w2");
    await flushSettings();

    expect(wrote()).toBe(false);
    expect(useStore.getState().settings.appearance.theme).toBe("dark");
  });

  it("are ignored when the window hears itself (M1)", () => {
    sent("main");
    expect(useStore.getState().settings.appearance.theme).toBe(DEFAULTS.appearance.theme);
  });
});

describe("writing settings.json", () => {
  it("tells the other windows, once the file is really there", async () => {
    saveSettings(CHANGED);
    await flushSettings();

    expect(wrote()).toBe(true);
    expect(emit).toHaveBeenCalledWith("plain:settings-changed", {
      from: "main",
      settings: CHANGED,
    });
  });
});
