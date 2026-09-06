// Two widths you can drag: the rail (spec §4) and the text column (§3).
// Both are clamped, because a dragged edge must not be able to lose the
// thing it was sizing, and both survive a restart — the rail in the session,
// the column in settings.json.

import { beforeEach, describe, expect, it } from "vitest";
import { parseSession, toSession } from "./session";
import { CONTENT_WIDTH, firstRunSettings, parseSettings } from "./settings";
import { RAIL_WIDTH, clampRailWidth, useStore } from "./store";

beforeEach(() => {
  useStore.setState({ docs: [], activeId: null, recent: [], libraryPath: null, collapsed: [] });
  useStore.getState().setRailWidth(RAIL_WIDTH.default);
});

describe("rail width", () => {
  it("stays between 180 and 420", () => {
    expect(clampRailWidth(40)).toBe(RAIL_WIDTH.min);
    expect(clampRailWidth(9000)).toBe(RAIL_WIDTH.max);
    expect(clampRailWidth(300)).toBe(300);
  });

  it("falls back to the default rather than to NaN", () => {
    expect(clampRailWidth(Number.NaN)).toBe(RAIL_WIDTH.default);
  });

  it("is clamped on the way into the store too", () => {
    useStore.getState().setRailWidth(1000);
    expect(useStore.getState().railWidth).toBe(RAIL_WIDTH.max);
  });

  it("round-trips through the session", () => {
    useStore.getState().setRailWidth(301);
    expect(parseSession(JSON.stringify(toSession()))?.rail.width).toBe(301);
  });

  it("survives a session file that says something impossible", () => {
    const broken = JSON.stringify({ rail: { width: 5 } });
    expect(parseSession(broken)?.rail.width).toBe(RAIL_WIDTH.min);
    expect(parseSession(JSON.stringify({}))?.rail.width).toBe(RAIL_WIDTH.default);
  });
});

describe("content width", () => {
  it("is kept between 440 and 1400", () => {
    const wide = parseSettings(JSON.stringify({ appearance: { contentWidth: 3000 } }));
    expect(wide.settings.appearance.contentWidth).toBe(CONTENT_WIDTH.max);
    const narrow = parseSettings(JSON.stringify({ appearance: { contentWidth: 100 } }));
    expect(narrow.settings.appearance.contentWidth).toBe(CONTENT_WIDTH.min);
  });

  it("keeps a width the old ceiling would have cut off", () => {
    const settings = parseSettings(JSON.stringify({ appearance: { contentWidth: 1120 } }));
    expect(settings.settings.appearance.contentWidth).toBe(1120);
  });

  it("starts at 720 on a wide screen and 560 otherwise", () => {
    expect(firstRunSettings(1920).appearance.contentWidth).toBe(720);
    expect(firstRunSettings(1600).appearance.contentWidth).toBe(720);
    expect(firstRunSettings(1440).appearance.contentWidth).toBe(560);
  });

  it("only does that on a first run — a file that exists decides", () => {
    // Whatever the screen is: this went through settings.json, so 560 is
    // what the file leaves unsaid, not what the monitor suggests.
    expect(parseSettings("{}").settings.appearance.contentWidth).toBe(560);
    expect(
      parseSettings(JSON.stringify({ appearance: { theme: "dark" } })).settings.appearance
        .contentWidth,
    ).toBe(560);
  });
});
