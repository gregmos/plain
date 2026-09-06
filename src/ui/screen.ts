// A screen is a page you should be able to read with the keyboard, so the
// element that scrolls takes the focus when the screen opens: `PageDown`,
// `Space`, the arrows and `End` act on the focused scroller and nowhere
// else. Each screen does this for itself — a single effect in App could
// only run after the screens' own effects, and would take the focus back off
// the field that folder search had just put it in (review #4).

import { useEffect, useRef, type RefObject } from "react";

/** Focuses a scroller the screen already has a ref to. */
export function useFocusOnMount(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [ref]);
}

/**
 * The ref for a screen's scrolling element. Put it on the element that
 * carries `overflow: auto`, together with `tabIndex={0}` — declared in the
 * markup, so the element is focusable before anything tries to focus it.
 */
export function useScreenFocus<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useFocusOnMount(ref);
  return ref;
}
