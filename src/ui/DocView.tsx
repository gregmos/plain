import type { Doc } from "../app/store";

/**
 * Wave 1 shows the source as-is in both modes. Read gets the unified
 * pipeline in wave 2, edit gets CodeMirror in wave 3.
 */
export function DocView({ doc }: { doc: Doc }) {
  return (
    <div className="content">
      <pre className={doc.mode === "read" ? "raw raw-read" : "raw raw-edit"}>{doc.text}</pre>
    </div>
  );
}
