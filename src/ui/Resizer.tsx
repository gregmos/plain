// The two edges you can pull: the rail's right border (spec §4) and the
// sides of the text column (spec §3). Both are pointer drags on a narrow
// invisible strip, so the shared part is the drag itself and the two
// components differ only in what a pixel of movement means.

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { CONTENT_WIDTH } from "../app/settings";
import { applyAppearance } from "../app/theme";
import { RAIL_WIDTH, useStore } from "../app/store";
import "./resizer.css";

interface Edge {
  /** The value the drag starts from, read once when the pointer goes down. */
  onStart: () => number;
  /** Where the drag has got to, from where it began. Returns the new value. */
  onMove: (start: number, dx: number) => number;
  /** The value worth keeping, once. */
  onDone: (value: number) => void;
}

/**
 * A drag on one of the strips. The start is taken at `pointerdown` rather
 * than inferred from a zero distance — bringing the pointer back to where it
 * began is a real position, not the beginning again (review #4).
 *
 * Finishing is one idempotent step, reached from `pointerup`, from a
 * cancelled or lost capture, and from the strip going away mid-drag: a mode
 * switch or a hotkey can unmount the editor under the pointer, and a drag
 * abandoned there would leave the CSS variable at the new width while the
 * store and settings.json still held the old one (review #3).
 */
function useEdgeDrag({ onStart, onMove, onDone }: Edge) {
  const [dragging, setDragging] = useState(false);
  const finishing = useRef<(() => void) | null>(null);

  useEffect(() => () => finishing.current?.(), []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Left button only: a right-click on the strip is not a drag.
    if (event.button !== 0) return;
    event.preventDefault();
    const strip = event.currentTarget;
    const startX = event.clientX;
    const start = onStart();
    let last = start;
    strip.setPointerCapture(event.pointerId);
    setDragging(true);

    const move = (moved: PointerEvent) => {
      last = onMove(start, moved.clientX - startX);
    };
    const finish = () => {
      if (finishing.current !== finish) return;
      finishing.current = null;
      strip.removeEventListener("pointermove", move);
      strip.removeEventListener("pointerup", finish);
      strip.removeEventListener("pointercancel", finish);
      strip.removeEventListener("lostpointercapture", finish);
      setDragging(false);
      onDone(last);
    };

    finishing.current = finish;
    strip.addEventListener("pointermove", move);
    strip.addEventListener("pointerup", finish);
    strip.addEventListener("pointercancel", finish);
    strip.addEventListener("lostpointercapture", finish);
  };

  return { dragging, onPointerDown };
}

/**
 * The rail's right border. The width goes to the store as you drag — the
 * rail is a CSS variable on `.app`, so that is what redraws it — and the
 * session picks it up from there on its own debounce. Nothing is left to do
 * when the drag ends: the store has had every step of it.
 */
export function RailResizer() {
  const { dragging, onPointerDown } = useEdgeDrag({
    onStart: () => useStore.getState().railWidth,
    onMove: (start, dx) => {
      useStore.getState().setRailWidth(start + dx);
      return useStore.getState().railWidth;
    },
    onDone: () => {},
  });

  return (
    <div
      className={"rail-resizer" + (dragging ? " is-dragging" : "")}
      onPointerDown={onPointerDown}
      onDoubleClick={() => useStore.getState().setRailWidth(RAIL_WIDTH.default)}
      role="separator"
      aria-orientation="vertical"
      aria-label="rail width"
    />
  );
}

const DEFAULT_CONTENT = 560;

function clampContent(width: number): number {
  return Math.round(Math.min(CONTENT_WIDTH.max, Math.max(CONTENT_WIDTH.min, width)));
}

function setContentWidth(contentWidth: number): void {
  const store = useStore.getState();
  store.changeSettings({
    ...store.settings,
    appearance: { ...store.settings.appearance, contentWidth },
  });
}

/**
 * A side of the text column. The column is centred, so pulling one edge
 * outwards by 40px widens it by 80 — otherwise the text would slide sideways
 * under the pointer instead of growing.
 *
 * While the drag runs only the CSS variable moves; settings.json is written
 * once, when the drag finishes, through the store's usual debounce.
 */
export function ColumnEdge({ side }: { side: "left" | "right" }) {
  const away = side === "right" ? 2 : -2;

  const { dragging, onPointerDown } = useEdgeDrag({
    onStart: () => useStore.getState().settings.appearance.contentWidth,
    onMove: (start, dx) => {
      const width = clampContent(start + dx * away);
      const { appearance } = useStore.getState().settings;
      applyAppearance({ ...appearance, contentWidth: width });
      return width;
    },
    onDone: setContentWidth,
  });

  return (
    <div
      className={`column-edge column-edge-${side}` + (dragging ? " is-dragging" : "")}
      onPointerDown={onPointerDown}
      onDoubleClick={() => setContentWidth(DEFAULT_CONTENT)}
      role="separator"
      aria-orientation="vertical"
      aria-label="column width"
    />
  );
}
