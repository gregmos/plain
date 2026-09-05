import type { Doc } from "../app/store";

// Wave 2 replaces this stub with the rendered document.
export function ReadView({ doc }: { doc: Doc }) {
  return (
    <div className="content">
      <pre className="raw raw-read">{doc.text}</pre>
    </div>
  );
}
