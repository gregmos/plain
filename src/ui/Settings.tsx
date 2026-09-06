// The settings screen (spec §10, mockup 1e). It sits where the document
// would be; `Esc` goes back. Every change applies at once and is written to
// %APPDATA%\Plain\settings.json — there is no `apply` button.

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { openSettingsFile } from "../app/commands";
import { AUTOSAVE, CONTENT_WIDTH, DEFAULTS, defaultEol, type Settings } from "../app/settings";
import { useStore } from "../app/store";
import { TREE_CHANGED } from "../app/watcher";
import { syncLineNumbers } from "../editor/setup";
import "./dialogs.css";
import "./settings.css";

/** `−`/`+` bounds, from spec §10. */
const FONT_SIZE = { min: 11, max: 20, step: 0.5 };


function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 13.5 stays 13.5, 14.0 becomes 14. */
function short(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function Row({
  name,
  about,
  children,
}: {
  name: string;
  about: string;
  children: ReactNode;
}) {
  return (
    <div className="setting">
      <div className="setting-key">
        <span className="setting-name">{name}</span>
        <span className="setting-about">{about}</span>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

/** Words separated by `·`; the one in force is `--fg`, the rest `--muted`. */
function Choice<T extends string | number | boolean>({
  value,
  options,
  onPick,
}: {
  value: T;
  options: { label: string; value: T }[];
  onPick: (value: T) => void;
}) {
  return (
    <span className="choice">
      {options.map((option, index) => (
        <Fragment key={option.label}>
          {index > 0 && <span className="sep">·</span>}
          <button
            className={option.value === value ? "choice-option is-on" : "choice-option"}
            onClick={() => onPick(option.value)}
          >
            {option.label}
          </button>
        </Fragment>
      ))}
    </span>
  );
}

function Stepper({
  value,
  bounds,
  onChange,
}: {
  value: number;
  bounds: { min: number; max: number; step: number };
  onChange: (value: number) => void;
}) {
  const step = (direction: number) =>
    onChange(clamp(value + direction * bounds.step, bounds.min, bounds.max));
  return (
    <span className="number">
      <button className="number-step" onClick={() => step(-1)} title="less">
        −
      </button>
      <span className="number-value">{short(value)}</span>
      <button className="number-step" onClick={() => step(1)} title="more">
        +
      </button>
    </span>
  );
}

const ON_OFF = [
  { label: "on", value: true },
  { label: "off", value: false },
];

export function SettingsScreen() {
  const settings = useStore((s) => s.settings);
  const change = useStore((s) => s.changeSettings);
  const close = () => useStore.getState().closeScreen();

  // The extensions field is free text while it is being typed; the settings
  // only hear about it once the field is left or Enter is pressed.
  const [extensions, setExtensions] = useState(settings.library.extensions.join(", "));
  useEffect(() => setExtensions(settings.library.extensions.join(", ")), [settings.library.extensions]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // The `defaults` confirmation is a modal on top; Esc belongs to it.
      if (useStore.getState().dialog) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  const patch = (next: Settings) => change(next);

  const commitExtensions = () => {
    const list = extensions
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => (item.startsWith(".") ? item : `.${item}`));
    const value = list.length > 0 ? list : DEFAULTS.library.extensions;
    setExtensions(value.join(", "));
    if (value.join() === settings.library.extensions.join()) return;
    patch({ ...settings, library: { extensions: value } });
    window.dispatchEvent(new CustomEvent(TREE_CHANGED));
  };

  const restoreDefaults = () => {
    const store = useStore.getState();
    store.setDialog({
      title: "reset every setting?",
      lines: ["the file goes back to what plain ships with."],
      actions: [
        {
          label: "reset",
          run: () => {
            store.setDialog(null);
            change(DEFAULTS);
            syncLineNumbers();
            window.dispatchEvent(new CustomEvent(TREE_CHANGED));
          },
        },
        { label: "cancel", run: () => store.setDialog(null) },
      ],
      cancel: () => store.setDialog(null),
    });
  };

  return (
    <div className="screen">
      <div className="screen-column settings-column">
        <div className="settings-head">
          <h1 className="screen-title">settings</h1>
          <button className="link" onClick={close}>
            close
          </button>
        </div>

        <Row name="appearance.theme" about="dark follows windows until you pick one">
          <Choice
            value={settings.appearance.theme}
            options={[
              { label: "system", value: "system" as const },
              { label: "light", value: "light" as const },
              { label: "dark", value: "dark" as const },
            ]}
            onPick={(theme) => useStore.getState().setTheme(theme)}
          />
        </Row>

        <Row name="appearance.fontSize" about="the text of the document, in pixels">
          <Stepper
            value={settings.appearance.fontSize}
            bounds={FONT_SIZE}
            onChange={(fontSize) =>
              patch({ ...settings, appearance: { ...settings.appearance, fontSize } })
            }
          />
        </Row>

        <Row
          name="appearance.contentWidth"
          about="drag the column edges to change it too; edit adds 80"
        >
          <Stepper
            value={settings.appearance.contentWidth}
            bounds={CONTENT_WIDTH}
            onChange={(contentWidth) =>
              patch({ ...settings, appearance: { ...settings.appearance, contentWidth } })
            }
          />
        </Row>

        <Row name="read.codeWrap" about="wrap long lines inside code blocks">
          <Choice
            value={settings.read.codeWrap}
            options={ON_OFF}
            onPick={(codeWrap) => patch({ ...settings, read: { codeWrap } })}
          />
        </Row>

        <Row name="edit.lineNumbers" about="ctrl shift 9 still flips them for the session">
          <Choice
            value={settings.edit.lineNumbers}
            options={ON_OFF}
            onPick={(lineNumbers) => {
              patch({ ...settings, edit: { ...settings.edit, lineNumbers } });
              syncLineNumbers();
            }}
          />
        </Row>

        <Row name="edit.indentUnit" about="what the file already uses wins over this">
          <Choice
            value={settings.edit.indentUnit}
            options={[
              { label: "tab", value: "tab" as const },
              { label: "2", value: 2 as const },
              { label: "4", value: 4 as const },
            ]}
            onPick={(indentUnit) => patch({ ...settings, edit: { ...settings.edit, indentUnit } })}
          />
        </Row>

        <Row name="files.newFileEol" about={`line endings for files plain creates; ${defaultEol()} here`}>
          <Choice
            value={settings.files.newFileEol}
            options={[
              { label: "crlf", value: "crlf" as const },
              { label: "lf", value: "lf" as const },
            ]}
            onPick={(newFileEol) => patch({ ...settings, files: { ...settings.files, newFileEol } })}
          />
        </Row>

        <Row name="files.autosave" about="seconds; 0 turns it off">
          <Stepper
            value={settings.files.autosave}
            bounds={AUTOSAVE}
            onChange={(autosave) => patch({ ...settings, files: { ...settings.files, autosave } })}
          />
        </Row>

        <Row name="library.extensions" about="what the file tree shows, comma separated">
          <input
            className="setting-field"
            value={extensions}
            spellCheck={false}
            onChange={(event) => setExtensions(event.target.value)}
            onBlur={commitExtensions}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
        </Row>

        <div className="screen-actions">
          <button
            className="link"
            onClick={() => {
              close();
              void openSettingsFile();
            }}
          >
            open settings.json
          </button>
          <span className="sep">·</span>
          <button className="link" onClick={restoreDefaults}>
            defaults
          </button>
        </div>
      </div>
    </div>
  );
}
