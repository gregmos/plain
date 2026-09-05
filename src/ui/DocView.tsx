import { useCallback, useRef } from "react";
import { Group, Panel, Separator, type Layout } from "react-resizable-panels";
import { useStore, type Doc } from "../app/store";
import { ReadView } from "../read/ReadView";
import { EditView } from "../editor/EditView";
import "./split.css";

/**
 * Four views over one buffer (spec §5.0): read renders it, edit shows the
 * source, rich is edit with the markers hidden (§5.3), split is edit and read
 * side by side over the same document (§2a).
 */
export function DocView({ doc }: { doc: Doc }) {
  if (doc.mode === "read") return <ReadView doc={doc} />;
  if (doc.mode === "split") return <SplitView doc={doc} />;
  return <EditView doc={doc} rich={doc.mode === "rich"} />;
}

const EDITOR_PANEL = "split-editor";
const READER_PANEL = "split-reader";

function SplitView({ doc }: { doc: Doc }) {
  // Read once: the store keeps the width for the session, but re-rendering
  // the group with a new default would fight whoever is dragging it.
  const start = useRef(useStore.getState().splitRatio);
  const setSplitRatio = useStore((s) => s.setSplitRatio);

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
        <ReadView doc={doc} />
      </Panel>
    </Group>
  );
}
