Ревью текущего дерева: в нём уже есть части v0.2. Файлы не менял; полные test suites не повторял. Примеры rich и text export проверил в Node, ограничения CM6 — по установленным исходникам.

1. **Критично — [drafts.ts:177](<G:/Claude Projects/md reader/src/app/drafts.ts:177>): recovery теряет `decodeErrors`.**  
   Сценарий: открыть malformed UTF-16, поправить текст, дождаться draft, kill → restore → `Ctrl+S`. Флаг не записывается в draft и не восстанавливается; даже повторный `readFile()` в `restoreDraft()` его игнорирует. Сохранение заменяет повреждённые байты на U+FFFD без предупреждения. **Предложение:** сохранять флаг вместе с текстом и восстанавливать защиту перед записью.

2. **Критично — [save.ts:238](<G:/Claude Projects/md reader/src/app/save.ts:238>): `Save As` на исходный путь обходит защиту кодировки.**  
   `saveAsNow()` не проверяет `decodeErrors`, пишет с `baseHash: null`, затем сбрасывает флаг. Для повреждённого файла выбор собственного имени уничтожает исходные байты; системное подтверждение overwrite не объясняет потерю при декодировании. Аналогично legacy-файл преобразуется без отдельного предупреждения о conversion. **Предложение:** после canonicalization распознавать исходный target и применять проверки обычного save.

3. **Критично — [rich.ts:140](<G:/Claude Projects/md reader/src/editor/rich.ts:140>): многострочный link title ломает построение rich.**  
   Валидный `[link](url "hello\nworld")` создаёт `Decoration.replace`, пересекающую newline. CM6 явно запрещает такие decorations из ViewPlugin и выбрасывает `RangeError`. Дополнительно `hide()` проверяет active только у начала диапазона: продолжение на активной строке тоже скрывается. **Предложение:** разбивать скрываемые диапазоны по строкам, исключая newline и каждую активную строку.

4. **Стоит поправить — [fs.rs:458](<G:/Claude Projects/md reader/src-tauri/src/fs.rs:458>): остаток w45 №9 — окно потери внешней правки осталось.**  
   Temp теперь готовится заранее, но между чтением target для проверки hash и `commit()` внешний процесс всё ещё может записать новую версию. `ReplaceFileW` заменит её без backup; последующий snapshot содержит уже нашу версию. **Предложение:** сохранять фактически заменяемую версию через backup и обрабатывать несовпадение как конфликт. Перестановка staging уменьшила вероятность, но не дала обещанной защиты.

5. **Стоит поправить — [save.ts:225](<G:/Claude Projects/md reader/src/app/save.ts:225>), [buffers.ts:27](<G:/Claude Projects/md reader/src/editor/buffers.ts:27>): копия read-only файла остаётся read-only в CM6.**  
   После успешного Save As `Doc.readOnly` становится `false`, но перенесённый EditorState сохраняет `EditorState.readOnly.of(true)`. Интерфейс считает новую копию доступной для редактирования, а ввод и formatting остаются заблокированы. **Предложение:** реконфигурировать read-only facet при изменении свойства документа.

6. **Стоит поправить — [rich.ts:183](<G:/Claude Projects/md reader/src/editor/rich.ts:183>): regex скрывают буквальный текст.**  
   Проверено: внутри `` `==code== [[note]]` `` исчезают `==` и brackets; `\==literal==` тоже получает highlight. Проверяется только принадлежность начала строки block code, без `InlineCode`, escapes и контекста самого match. **Предложение:** применять regex к допустимым текстовым участкам syntaxTree, исключая code, escapes и служебные части links.

7. **Стоит поправить — [commands.ts:345](<G:/Claude Projects/md reader/src/editor/commands.ts:345>): часть checkbox widgets не переключается.**  
   Для `1. [ ] task`, `> - [ ] task` и `-  [ ] task` Lezer создаёт `TaskMarker`, rich показывает widget, но `toggleCheckboxAt()` возвращает `false`: regex допускает только unordered marker с одним пробелом. Все три случая воспроизведены. **Предложение:** передавать точную позицию `TaskMarker` и менять символ внутри него, без повторного распознавания всей строки.

8. **Стоит поправить — [setup.ts:257](<G:/Claude Projects/md reader/src/editor/setup.ts:257>), [registry.ts:297](<G:/Claude Projects/md reader/src/app/registry.ts:297>): `Alt+←/→` имеют двух владельцев.**  
   В подключённом `defaultKeymap` это `cursorSyntaxLeft/Right`, в registry — history navigation. CM сначала передвигает каретку, затем tinykeys выполняет navigation, поскольку его `ignore` не учитывает `defaultPrevented`. **Предложение:** исключить эти bindings из CM либо явно уступать их app через существующий capture keymap. Аналогичный конфликт есть у уже добавленного split chord `Ctrl+Shift+\`.

9. **Стоит поправить — [commands.ts:414](<G:/Claude Projects/md reader/src/app/commands.ts:414>), [commands.ts:442](<G:/Claude Projects/md reader/src/app/commands.ts:442>): HTML→text scanner портит экспорт.**  
   Проверено через настоящий `render()`:
   - `<a title="a > b">label</a>` экспортируется как `b">label`;
   - таблица с ячейками `A | B` превращается в `AB`;
   - code block теряет начальный отступ, trailing spaces и последовательности пустых строк.

   **Предложение:** использовать HTML parser и небольшой обход дерева с разделителями ячеек и отдельным сохранением `<pre>`. Собственный tokenizer, entity decoder и глобальная whitespace cleanup уже требуют больше поддержки, чем оправдывают для одного пользователя.

10. **Стоит поправить — [commands.ts:527](<G:/Claude Projects/md reader/src/app/commands.ts:527>): печать может печатать экран настроек вместо документа.**  
    При открытых Settings/Shortcuts `activeDoc` остаётся, но `DocView` размонтирован. `exportPdf()` меняет только mode: экран продолжает перекрывать документ и попадает в print. Даже при обычной печати CSS скрывает `.find`, тогда как read-поиск имеет класс `.findbar`. **Предложение:** перед печатью явно показывать выбранный документ, ждать готовности ReadView и исправить print selectors.

11. **Стоит поправить — [dom.ts:185](<G:/Claude Projects/md reader/src/read/dom.ts:185>): найденные позже wikilinks остаются некликабельными.**  
    Проверка существования использует разовый `libraryFiles()` и ставит `data-checked`. Создание целевого файла обновляет дерево, но не запускает повторную проверку; прежний `is-missing` блокирует клик в ReadView. Такое же состояние возможно при загрузке дерева после первого enhance. **Предложение:** перепроверять wikilinks при смене дерева, снимая устаревшие `checked` и `is-missing`.

12. **Стоит поправить — [search.rs:153](<G:/Claude Projects/md reader/src-tauri/src/search.rs:153>): regex повторно применяется к обрезанному контексту.**  
    Первое совпадение найдено на полной строке, затем `find_iter(window)` меняет смысл anchors и границ. Например, длинное совпадение `TODO.*done` выходит за окно и исчезает из highlight, хотя строка возвращается как результат. **Предложение:** искать на исходной строке, пересекать исходные match ranges с окном и переводить только эти диапазоны в UTF-16.

13. **Стоит поправить — [commands.ts:276](<G:/Claude Projects/md reader/src/app/commands.ts:276>): `open settings.json` открывает другой файл в portable mode.**  
    Загрузка и сохранение настроек используют `dataDir()`, а эта команда напрямую использует `appDataDir()`. Пользователь редактирует `%APPDATA%\Plain\settings.json`, который запущенный portable экземпляр не читает. **Предложение:** использовать существующий `settingsPath()`.

14. **Стоит поправить — [README.md:23](<G:/Claude Projects/md reader/README.md:23>), [README.md:54](<G:/Claude Projects/md reader/README.md:54>): две неверные гарантии для получателя сборки.**  
    `It will not ask again` нельзя обещать для SmartScreen: новая unsigned-сборка получает собственную репутацию и может снова вызвать предупреждение ([Microsoft Learn](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)). `Plain creates nothing inside your own folders` противоречит созданию документов, temporary files и уже реализованным `assets/`. **Предложение:** написать, что предупреждение *может* появиться, включая обновления; обещание про папки сузить до отсутствия служебных постоянных индексов и кэшей.

---
Диспозиция оркестратора (2026-09-05): принято 1–3, 5–14; п.4 (backup при ReplaceFileW) отклонён как несоразмерный для личного использования — окно между проверкой хэша и `ReplaceFileW` составляет миллисекунды после переноса staging до проверки.
