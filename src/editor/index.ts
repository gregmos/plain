// What the rest of the app needs from the editor. Saving, reloading and
// Save As talk to it only through these.

export {
  EditView,
  flushActiveEditor,
  renameBuffer,
  replaceText,
  runEditorCommand,
} from "./EditView";
export { dropBuffer, isDirty, markSaved } from "./buffers";
