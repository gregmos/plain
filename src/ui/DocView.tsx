import type { Doc } from "../app/store";
import { ReadView } from "../read/ReadView";
import { EditView } from "../editor/EditView";

/**
 * Three views over one buffer (spec §5.0): read renders it, edit shows the
 * source, rich is edit with the markers hidden (§5.3).
 */
export function DocView({ doc }: { doc: Doc }) {
  if (doc.mode === "read") return <ReadView doc={doc} />;
  return <EditView doc={doc} rich={doc.mode === "rich"} />;
}
