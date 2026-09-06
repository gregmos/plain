// The window furniture: banners under the mode bar, and the rail giving way
// when the window is too narrow to hold both it and a column of text.

import { beforeEach, describe, expect, it } from "vitest";
import { parseSession, toSession } from "./session";
import { BANNER_LIMIT, NARROW_WINDOW, RAIL_WIDTH, railForWidth, useStore } from "./store";

beforeEach(() => {
  useStore.setState({ banners: [], railCollapsed: false, railAuto: false });
});

describe("banners", () => {
  const show = (id: string, text = id) => useStore.getState().showBanner({ id, text });

  it("stacks rather than replacing, most urgent first", () => {
    show("open-failed");
    show("conflict");
    expect(useStore.getState().banners.map((b) => b.id)).toEqual(["conflict", "open-failed"]);
  });

  it("shows no more than two at once", () => {
    show("open-failed");
    show("drafts");
    show("conflict");
    expect(useStore.getState().banners).toHaveLength(BANNER_LIMIT);
    expect(useStore.getState().banners[0]?.id).toBe("conflict");
  });

  it("replaces a banner that says the same thing again", () => {
    show("save-failed", "first try");
    show("save-failed", "second try");
    expect(useStore.getState().banners).toHaveLength(1);
    expect(useStore.getState().banners[0]?.text).toBe("second try");
  });

  it("gives everything but the conflict a way to be put down", () => {
    show("drafts");
    show("conflict");
    const [conflict, drafts] = useStore.getState().banners;
    expect(drafts?.actions?.some((a) => a.label === "dismiss")).toBe(true);
    expect(conflict?.actions ?? []).toHaveLength(0);
  });

  it("keeps the actions a banner came with", () => {
    useStore.getState().showBanner({
      id: "save-failed",
      text: "couldn't write",
      actions: [{ label: "retry", run: () => {} }],
    });
    expect(useStore.getState().banners[0]?.actions?.map((a) => a.label)).toEqual([
      "retry",
      "dismiss",
    ]);
  });

  it("dismissing one leaves the others up", () => {
    show("open-failed");
    show("conflict");
    useStore.getState().dismissBanner("conflict");
    expect(useStore.getState().banners.map((b) => b.id)).toEqual(["open-failed"]);
  });

  it("dismissing without an id clears the lot", () => {
    show("open-failed");
    show("conflict");
    useStore.getState().dismissBanner();
    expect(useStore.getState().banners).toEqual([]);
  });

  it("the dismiss it adds actually works", () => {
    show("drafts");
    useStore.getState().banners[0]?.actions?.[0]?.run();
    expect(useStore.getState().banners).toEqual([]);
  });
});

describe("the rail on a narrow window", () => {
  const open = { collapsed: false, auto: false };

  it("closes it when the window is too narrow", () => {
    expect(railForWidth(NARROW_WINDOW - 1, open)).toEqual({
      railCollapsed: true,
      railAuto: true,
    });
  });

  it("leaves a wide window alone", () => {
    expect(railForWidth(1100, open)).toBeNull();
  });

  it("opens it again when the window grows back", () => {
    expect(railForWidth(1100, { collapsed: true, auto: true })).toEqual({
      railCollapsed: false,
      railAuto: false,
    });
  });

  it("does not reopen a rail the reader closed", () => {
    expect(railForWidth(1100, { collapsed: true, auto: false })).toBeNull();
  });

  it("says nothing twice while the window stays narrow", () => {
    expect(railForWidth(480, { collapsed: true, auto: true })).toBeNull();
  });

  it("collapsing by hand takes the automatic flag off", () => {
    useStore.getState().fitRail(480);
    expect(useStore.getState().railAuto).toBe(true);
    useStore.getState().toggleRail();
    useStore.getState().toggleRail();
    expect(useStore.getState().railAuto).toBe(false);
    // And now a wide window leaves the reader's choice alone.
    useStore.setState({ railCollapsed: true, railAuto: false });
    useStore.getState().fitRail(1400);
    expect(useStore.getState().railCollapsed).toBe(true);
  });

  it("has a default width inside the range it can be dragged to", () => {
    expect(RAIL_WIDTH.default).toBeGreaterThanOrEqual(RAIL_WIDTH.min);
    expect(RAIL_WIDTH.default).toBeLessThanOrEqual(RAIL_WIDTH.max);
  });
});

describe("the rail across a restart (review #6)", () => {
  it("saves what the reader chose, not what the window did", () => {
    useStore.setState({ railCollapsed: false, railAuto: false });
    useStore.getState().fitRail(480);
    expect(useStore.getState().railCollapsed).toBe(true);
    // The window collapsed it, so the session still says "open".
    expect(toSession().rail.collapsed).toBe(false);
  });

  it("saves a collapse the reader asked for", () => {
    useStore.setState({ railCollapsed: false, railAuto: false });
    useStore.getState().toggleRail();
    expect(toSession().rail.collapsed).toBe(true);
  });

  it("restores open on a narrow window, collapses it, and gives it back", () => {
    // What bootstrap does: the session's choice first, then the window.
    const session = parseSession(JSON.stringify({ rail: { collapsed: false, view: "files" } }));
    useStore.getState().setRailCollapsed(session?.rail.collapsed ?? false);
    expect(useStore.getState().railAuto).toBe(false);

    useStore.getState().fitRail(480);
    expect(useStore.getState().railCollapsed).toBe(true);
    expect(useStore.getState().railAuto).toBe(true);

    useStore.getState().fitRail(1400);
    expect(useStore.getState().railCollapsed).toBe(false);
    expect(useStore.getState().railAuto).toBe(false);
  });

  it("leaves a rail the session says was closed closed, however wide the window", () => {
    const session = parseSession(JSON.stringify({ rail: { collapsed: true, view: "files" } }));
    useStore.getState().setRailCollapsed(session?.rail.collapsed ?? false);
    useStore.getState().fitRail(1400);
    expect(useStore.getState().railCollapsed).toBe(true);
  });
});
