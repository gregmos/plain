// @vitest-environment happy-dom
//
// A dialog is the one question on screen. `Ctrl+K` used to open quick search
// on top of it and a mode chord used to switch modes underneath it, both
// leaving the dialog stranded over an app that had moved on (review #5).

import { beforeEach, describe, expect, it } from "vitest";
import { installKeys } from "./keys";
import { makeDoc, useStore } from "./store";

function press(key: string, mods: { ctrl?: boolean; shift?: boolean; alt?: boolean } = {}) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      ctrlKey: mods.ctrl ?? false,
      shiftKey: mods.shift ?? false,
      altKey: mods.alt ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

const nothing = () => {};
let off: () => void;

beforeEach(() => {
  useStore.setState({ docs: [], activeId: null, dialog: null, quickSearch: null, screen: null });
  useStore.getState().openDoc(makeDoc({ id: "a", path: "C:/a.md", text: "a" }));
  off?.();
  off = installKeys();
});

describe("while a dialog is up", () => {
  it("Ctrl+K does not open quick search over it", () => {
    useStore.getState().setDialog({
      title: "unsaved changes",
      actions: [{ label: "cancel", run: nothing }],
      cancel: nothing,
    });
    press("k", { ctrl: true });
    expect(useStore.getState().quickSearch).toBeNull();
    expect(useStore.getState().dialog).not.toBeNull();
  });

  it("a mode chord does not switch the document underneath", () => {
    const before = useStore.getState().docs[0]?.mode;
    useStore.getState().setDialog({
      title: "delete?",
      actions: [{ label: "cancel", run: nothing }],
      cancel: nothing,
    });
    press("2", { ctrl: true, alt: true });
    expect(useStore.getState().docs[0]?.mode).toBe(before);
  });

  it("the same chords work again once it is answered", () => {
    useStore.getState().setDialog({
      title: "delete?",
      actions: [{ label: "cancel", run: nothing }],
      cancel: nothing,
    });
    press("k", { ctrl: true });
    expect(useStore.getState().quickSearch).toBeNull();

    useStore.getState().setDialog(null);
    press("k", { ctrl: true });
    expect(useStore.getState().quickSearch).not.toBeNull();
  });
});
