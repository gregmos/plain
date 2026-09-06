import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator, type Layout } from "react-resizable-panels";
import { useStore, type Doc } from "../app/store";
import { ReadView } from "../read/ReadView";
import { EditView } from "../editor/EditView";
import { ColumnEdge } from "./Resizer";
import "./resizer.css";
import "./split.css";

/**
 * Four views over one buffer (spec §5.0): read renders it, edit shows the
 * source, rich is edit with the markers hidden (§5.3), split is edit and read
 * side by side over the same document (§2a).
 */
export function DocView({ doc }: { doc: Doc }) {
  // Split has two panels of its own and a handle between them; the column
  // edges belong to the one-column modes (spec §3).
  if (doc.mode === "split") return <SplitView doc={doc} />;
  return (
    <div className={"content-frame" + (doc.mode === "read" ? "" : " is-edit")}>
      {doc.mode === "read" ? (
        <ReadView doc={doc} />
      ) : (
        <EditView doc={doc} rich={doc.mode === "rich"} />
      )}
      <ColumnEdge side="left" />
      <ColumnEdge side="right" />
    </div>
  );
}

const EDITOR_PANEL = "split-editor";
const READER_PANEL = "split-reader";

/** The preview waits for a pause in the typing (spec §2a, review #9). */
const PREVIEW_MS = 300;

function usePreview(doc: Doc): Doc {
  const [text, setText] = useState(doc.text);
  const shown = useRef(doc.id);

  useEffect(() => {
    // A different document is not a keystroke: show it at once.
    if (shown.current !== doc.id) {
      shown.current = doc.id;
      setText(doc.text);
      return;
    }
    if (doc.text === text) return;
    const timer = window.setTimeout(() => setText(doc.text), PREVIEW_MS);
    return () => window.clearTimeout(timer);
  }, [doc.id, doc.text, text]);

  // Everything else about the document is current; only the text lags, so
  // the read pipeline's own cache sees no change while typing.
  return useMemo(() => ({ ...doc, text }), [doc, text]);
}

function SplitView({ doc }: { doc: Doc }) {
  // Read once: the store keeps the width for the session, but re-rendering
  // the group with a new default would fight whoever is dragging it.
  const start = useRef(useStore.getState().splitRatio);
  const setSplitRatio = useStore((s) => s.setSplitRatio);
  const preview = usePreview(doc);

  const onLayoutChanged = useCallback(
    (layout: Layout) => {
      const left = layout[EDITOR_PANEL];
      if (typeof left === "number") setSplitRatio(left / 100);
    },
    [setSplitRatio],
  );

  const defaultLayout: Layout = {
    [EDITOR_PANEL]: start.current * 100,
    [READER_PANEL]: (1 - start.current) * 100,
  };

  return (
    <Group
      className="split"
      orientation="horizontal"
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <Panel id={EDITOR_PANEL} className="split-panel" minSize="20%">
        <EditView doc={doc} split />
      </Panel>
      <Separator className="split-handle" />
      <Panel id={READER_PANEL} className="split-panel" minSize="20%">
        <ReadView doc={preview} />
      </Panel>
    </Group>
  );
}
