Ты ревьюишь v0.2 проекта Plain — личного Markdown reader/editor для Windows (Tauri 2 + React 19 + TS + Vite + CodeMirror 6 + Rust). Ничего не правь — только читай и пиши отзыв.

Контекст: норма — `ТЗ-Plain.md` v2.3, **§2a** (все пункты v0.2), §8 (сохранность — не экономим), §14. v0.1 уже отревьюен тобой (см. `review/waves/`), релиз v0.1.0 сделан. Тесты: 484 vitest, 66+9 cargo — зелёные. Живой прогон v0.2 ещё не делался.

Код v0.2 (новое с v0.1.0, `git diff v0.1.0 --stat` покажет):
1. **Сохранность+**: `src-tauri/src/history.rs` (snapshots при записи, правило 5 минут, sweep 30 дней), `fs.rs` (`encoded_bytes`, `snapshot_id` в `WriteRequest`), `lib.rs` (`pick_data_dir`/portable `data\` рядом с exe, `allow_directory(data_dir)` в setup), `src/app/history.ts` (list/restore/open/delete, `diffRows`), `src/app/save.ts` (`compareWithDisk`, `createAutosave`/`installAutosave`, `snapshotId`), `src/ui/History.tsx`, `src/ui/Diff.tsx`, `settings.ts` (`files.autosave`, `dataDir()`), `drafts.ts`/`session.ts` через `dataDir()`.
2. **Библиотека+**: `src-tauri/src/search.rs` (`collect_tags`, `backlinks` с канонизацией обоих путей), `tree.rs` (mtime/ctime), `src/library/{library,tags,backlinks}.ts`, `src/ui/Library.tsx`, `Rail.tsx` (секции tags / links here).
3. **Read+**: `src/read/tags.ts` (remark-плагин тегов в общем `markdownPreset`, `tagsOf`), `src/read/export.ts` (самодостаточный HTML: `?raw` CSS, KaTeX css, Shiki, mermaid SVG из DOM, data URI картинок ≤ 2 МБ), фокус-режим (`App.tsx`, `store.focus`, Esc-приоритеты).
4. **Редактор+**: `src/ui/DocView.tsx` (split: react-resizable-panels, EditView + ReadView одного документа), `src/editor/EditView.tsx` (проп split, синхронизация каретка→read через `headingAbove`), `src/editor/images.ts` (paste/drop картинок → `assets/`, plugin-fs `writeFile`/`copyFile`, permissions `fs:allow-write-file`/`allow-copy-file`), `src/library/dnd.ts` (ветка картинок), `session.ts` (`splitRatio`, режим split).

Ищем, по приоритету:
1. Потеря/порча текста и гонки: автосохранение + ручной Ctrl+S + конфликт + черновики (двойная запись? snapshot при автосохранении каждые N секунд — правило 5 минут держится?), `take disk`/`restore` из истории (одна undo-точка? baseHash/savedText обновляются правильно?), snapshot пишется ДО или ПОСЛЕ `ReplaceFileW` и что при ошибке; portable data dir и plugin-fs scope; `restore` перед которым делается forced snapshot текущего текста — кодировка/EOL.
2. Split view: два представления одного документа — `ReadView` и `EditView` оба держат scroll/позиции по `doc.id` (Map'ы), `announceHeading`/`emitScrollToLine` при размонтировании split — не путают ли они друг друга; `render()` на каждый idle-flush в split при 1 МБ; утечки.
3. Картинки: путь `assets/` для файла вне библиотеки, коллизии, запись через plugin-fs — scope (`allow_asset_dir` расширяет fs-scope рекурсивно — это осознанно), имя из даты; DnD — что если бросить не картинку в edit.
4. Теги/backlinks: regex-ловушки (`#` в URL, в code span — известно, что inline code не исключается на Rust-стороне; heading), производительность `collect_tags`/`backlinks` на 1000 файлов, инвалидация кэшей.
5. Экспорт HTML: `?raw` CSS — все ли селекторы read.css применимы без `.read-html`-обёртки; XSS — `render()` санитизирован, но SVG mermaid из DOM и data URI вставляются как есть; `<title>` эскейпинг.
6. Экраны (Library, History, Diff): Esc-приоритеты в `App.tsx` (несколько флагов `*Open` одновременно), фокус-режим прячет баннеры? (§2a: баннеры остаются).
7. Оверинжиниринг по критерию «окупится ли за месяц использования одним человеком».

Формат: находки файл:строка, суть, почему важно, предложение; «критично / стоит поправить / вкусовщина». Без пересказа и похвал. По-русски, термины по-английски.
