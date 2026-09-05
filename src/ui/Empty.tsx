import { openFile, openLibrary, openPaths } from "../app/commands";
import { basename, dirname } from "../app/paths";
import { useStore } from "../app/store";

export function Empty() {
  const recent = useStore((s) => s.recent);

  return (
    <div className="empty">
      <div className="empty-actions">
        <button className="link" onClick={() => void openFile()}>
          open a file
        </button>
        <span className="sep">·</span>
        <button className="link" onClick={() => void openLibrary()}>
          open a library
        </button>
      </div>

      {recent.length > 0 && (
        <div className="empty-recent">
          <div className="section-title">recent</div>
          {recent.map((path) => (
            <button key={path} className="recent-item" onClick={() => void openPaths([path])}>
              <span>{basename(path)}</span>
              <span className="recent-dir">{dirname(path)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
