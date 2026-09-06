// @vitest-environment happy-dom
//
// A dialog opens under whichever key was pressed, so what `Enter` answers
// matters: the focus goes to the action that undoes nothing.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useStore, type Dialog } from "../app/store";
import { Modal } from "./Modal";

let host: HTMLDivElement;
let root: Root;

function show(dialog: Dialog) {
  act(() => {
    useStore.getState().setDialog(dialog);
  });
}

function buttons(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll("button"));
}

function focused(): string {
  return (document.activeElement as HTMLElement | null)?.textContent ?? "";
}

const nothing = () => {};

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Modal />));
});

afterEach(() => {
  act(() => {
    useStore.getState().setDialog(null);
    root.unmount();
  });
  host.remove();
});

describe("which action has the focus", () => {
  it("takes the last one, which is cancel everywhere", () => {
    show({
      title: "delete file?",
      actions: [
        { label: "move to recycle bin", run: nothing },
        { label: "cancel", run: nothing },
      ],
      cancel: nothing,
    });
    expect(focused()).toBe("cancel");
  });

  it("takes the one the dialog names instead", () => {
    show({
      title: "unsaved changes",
      actions: [
        { label: "save", run: nothing },
        { label: "don't save", run: nothing },
        { label: "cancel", run: nothing },
      ],
      safe: "save",
      cancel: nothing,
    });
    expect(focused()).toBe("save");
  });

  it("falls back to the last one when the named action is not there", () => {
    show({
      title: "gone",
      actions: [
        { label: "retry", run: nothing },
        { label: "save as…", run: nothing },
      ],
      safe: "save",
      cancel: nothing,
    });
    expect(focused()).toBe("save as…");
  });
});

describe("tab", () => {
  beforeEach(() => {
    show({
      title: "unsaved changes",
      actions: [
        { label: "save", run: nothing },
        { label: "don't save", run: nothing },
        { label: "cancel", run: nothing },
      ],
      safe: "save",
      cancel: nothing,
    });
  });

  const tab = (shift = false) =>
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true }),
      );
    });

  it("moves along the actions", () => {
    expect(focused()).toBe("save");
    tab();
    expect(focused()).toBe("don't save");
    tab();
    expect(focused()).toBe("cancel");
  });

  it("comes round rather than leaving the dialog", () => {
    buttons()[2]?.focus();
    tab();
    expect(focused()).toBe("save");
  });

  it("goes back the other way with shift", () => {
    buttons()[0]?.focus();
    tab(true);
    expect(focused()).toBe("cancel");
  });
});

describe("closing", () => {
  it("gives the focus back to whatever had it", () => {
    const before = document.createElement("button");
    before.textContent = "the editor";
    document.body.appendChild(before);
    before.focus();

    show({ title: "hello", actions: [{ label: "close", run: nothing }], cancel: nothing });
    expect(focused()).toBe("close");

    act(() => useStore.getState().setDialog(null));
    expect(focused()).toBe("the editor");
    before.remove();
  });
});
