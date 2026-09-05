Ты ревьюишь волны 2 («Read») и 3 («Edit») проекта Plain — личного Markdown reader/editor для Windows (Tauri 2 + React 19 + TS + Vite + CodeMirror 6). Ничего не правь — только читай и пиши отзыв.

Контекст: личный проект для одного человека; норма — `ТЗ-Plain.md` v2.2 (§1.3, §5.0–5.3, §9, §11, §12, §14, §16), дизайн — `research/00-design-system-from-mockups.md`, макеты — `mockups/Markdown Editor.dc.html` (1a/1b read, 1c edit). Код волны 2: `src/read/**`, `src/ui/read.css`, `src/ui/Outline.tsx`. Волны 3: `src/editor/**`, `src/ui/editor.css`. Волны 1, 4, 5 (`src/app/**`, `src/library/**`, `src-tauri/**`) уже приняты — только контекст. Приложение запущено живьём и работает; тесты зелёные (174 vitest).

Что ищем, по приоритету:
1. Баги и тихие потери данных на стыке read/edit: `Doc.text` в zustand vs `EditorState` (sync.ts: idle-flush текста, rAF-каретка, `flushActiveEditor`), нормализация CRLF→LF в буфере и `savedText` (buffers.ts), события `plain:goto-line`/`plain:goto-heading`, переключение документов при открытом редакторе, утечки слушателей/буферов.
2. Безопасность §14 в пайплайне read (`src/read/pipeline.ts`): схема rehype-sanitize (`clobber: []`, добавленные атрибуты/классы, `dataSrc`), KaTeX после sanitize (`raw` узлы), `rehype-raw`, обработка ссылок (`javascript:`, `file:`), `convertFileSrc`/asset scope (`assets.ts`, `allow_asset_dir` в lib.rs расширяет и fs-scope на всю папку).
3. Корректность markdown: micromark-расширение wikilinks (`wikilink.ts`), callouts как mdast-трансформ (`callout.ts`), guard против валюты в `$` (`remarkMathGuard`), word count.
4. Команды форматирования (`src/editor/commands.ts`): toggle-семантика, мультивыделение, границы; `codeKeymap` в capture-фазе по `KeyboardEvent.code` (keymap.ts) — конфликты со стандартным keymap CM6 (например `Ctrl+D`, `Tab`), IME.
5. Производительность на 1 МБ: что на горячем пути ввода (setup.ts `lineLook` декорации, `frontMatterEnd`, `inCode` через syntaxTree), `render()` синхронный в useMemo.
6. Оверинжиниринг — критерий «окупится ли за месяц использования одним человеком».

Формат: список находок, каждая — файл:строка, суть, почему важно, предложение. Раздели на «критично / стоит поправить / вкусовщина». Не пересказывай код, не хвали. По-русски, термины по-английски.
