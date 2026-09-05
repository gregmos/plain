// What the rest of the app needs from the editor. Wave 4 (saving) talks to
// the editor only through these three.

export { EditView, flushActiveEditor } from "./EditView";
export { dropBuffer, markSaved, normalizeEol } from "./buffers";
