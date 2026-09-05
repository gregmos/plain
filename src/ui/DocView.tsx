import type { Doc } from "../app/store";
import { ReadView } from "../read/ReadView";
import { EditView } from "../editor/EditView";

/** Read and edit are two views over the same buffer (spec §5.0). */
export function DocView({ doc }: { doc: Doc }) {
  return doc.mode === "read" ? <ReadView doc={doc} /> : <EditView doc={doc} />;
}
