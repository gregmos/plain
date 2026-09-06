// What the rest of the app needs from the editor. Saving, reloading and
// Save As talk to it only through these.

export {
  dropImagesInEditor,
  EditView,
  flushActiveEditor,
  focusEditor,
  renameBuffer,
  replaceText,
  runEditorCommand,
  setReadOnly,
} from "./EditView";
export { dropBuffer, isDirty, markSaved } from "./buffers";
