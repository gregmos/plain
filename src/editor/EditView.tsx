import type { Doc } from "../app/store";

// Wave 3 replaces this stub with CodeMirror 6.
export function EditView({ doc }: { doc: Doc }) {
  return (
    <div className="content">
      <pre className="raw raw-edit">{doc.text}</pre>
    </div>
  );
}
