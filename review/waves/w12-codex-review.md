Ниже — находки. Текстовые примеры проверены через реальные CM6 `EditorState`, без записи файлов. Windows UI и native dialog не запускал.

1. **Критично — [commands.ts:598](</G:/Claude Projects/md reader/src/editor/commands.ts:598>): сноска падает при любом непустом выделении.**  
   Выделить `abc` → `insertFootnote` → `Selection points outside of document`. Позиция вычисляется без вычитания длины заменённого текста, поэтому всегда выходит за новый конец документа. Предложение: вычислять каретку через итоговый `ChangeSet` либо учитывать `main.to - main.from`.

2. **Критично — [commands.ts:234](</G:/Claude Projects/md reader/src/editor/commands.ts:234>): `toggleFence` удаляет чужие fences.**  
   `toggleMathBlock` внутри `` ```js\nx\n``` `` превращает документ в `x`, удаляя code block и язык. Общий regex также принимает ближайшие разделители разных блоков за пару: команда между двумя блоками может удалить закрытие первого и открытие второго. Предложение: устанавливать принадлежность одному блоку, проверять тип и длину delimiters; снимать только соответствующий формат, дедуплицировать блоки при multiselection.

3. **Стоит поправить — [commands.ts:531](</G:/Claude Projects/md reader/src/editor/commands.ts:531>): `insertRule` меняет смысл предыдущей строки.**  
   В `text\n|next` результат — `text\n---\n\nnext`: `text` становится Setext heading вместо появления horizontal rule. Проверяется только текст до каретки в текущей строке. Предложение: учитывать предыдущую строку и обеспечивать пустую строку перед `---`, включая вставку в начале строки.

4. **Стоит поправить — [commands.ts:316](</G:/Claude Projects/md reader/src/editor/commands.ts:316>): list toggle не сохраняет исходную разметку смешанного выделения.**  
   Дважды применить bullet toggle к `plain\n- existing` → `plain\nexisting`: исчезает исходный marker второго пункта. Решение для всех строк принимается по первой. Кроме того, в пустом документе все три команды ничего не делают. Предложение: определить обратимую семантику для смешанных строк, не переписывать существующие markers при добавлении; разрешить создание marker на пустой строке.

5. **Стоит поправить — [commands.ts:626](</G:/Claude Projects/md reader/src/editor/commands.ts:626>): выбор другого callout удаляет текущий вместо смены типа.**  
   Выбрать warning внутри `> [!NOTE]\n> text` → `text`. Это прямо закреплено новым тестом, но делает подменю выбора типа неожиданно разрушительным. При каретке дальше первой строки тела marker вообще не находится — создаётся вложенный callout. Предложение: находить содержащий callout; тот же тип снимать, другой заменять только в marker. Для раздельных selection groups обрабатывать каждый блок отдельно.

6. **Стоит поправить — [commands.ts:515](</G:/Claude Projects/md reader/src/editor/commands.ts:515>): wikilink не toggle.**  
   Два вызова на выделенном `word` дают `[[[[word]]]]`. Это противоречит §5.2 «toggle там, где есть что снимать». Предложение: снимать одну пару `[[` / `]]` вокруг выделения или внутри него.

7. **Стоит поправить — [commands.ts:554](</G:/Claude Projects/md reader/src/editor/commands.ts:554>): таблица разрывает list/quote context и игнорирует дополнительные выделения.**  
   В `- |item` получается пустой пункт списка, затем таблица верхнего уровня, затем отдельный `item`. Аналогично теряется quote context. Использование `selection.main` также молча отбрасывает остальные selections; это относится и к сноске. Предложение: вставлять блок с учётом container prefix и границ строки; обрабатывать все ranges, для сносок выделяя отдельные номера и общий хвост definitions.

8. **Стоит поправить — [commands.ts:572](</G:/Claude Projects/md reader/src/editor/commands.ts:572>): номера сносок собираются из literal code.**  
   Единственный текст `` `[^900]` `` даёт следующую сноску `901`. Regex также учитывает fenced code и escaped references. Предложение: исключать code/escaped ranges при сборе занятых идентификаторов. Отдельно уточнить «следующий свободный»: сейчас это всегда `max + 1`, пропуски не используются.

9. **Стоит поправить — [keymap.ts:93](</G:/Claude Projects/md reader/src/editor/keymap.ts:93>): семейство `Alt+Shift` конфликтует с переключением языка Windows.**  
   `code` сохраняет попадание в команду на русской раскладке, но не отменяет системную обработку модификаторов. Это проблема самого ТЗ, требующая изменения defaults вместе с ним. Сочетание подтверждено [Microsoft](https://support.microsoft.com/en-gb/office/switch-between-languages-using-the-language-bar-1c2242c0-fe15-4bc3-99bc-535de6f4f258).  
   `Ctrl+Alt+…` пригоден как вариант для RU/EN, но не универсальный default: [Windows использует его для AltGr](https://devblogs.microsoft.com/oldnewthing/20040329-00/?p=40003). Предложение: свободные сочетания без этой пары либо двухшаговые shortcuts; для block math также убрать четырёхмодификаторное сочетание.

10. **Стоит поправить — [active.ts:113](</G:/Claude Projects/md reader/src/editor/active.ts:113>): активные кнопки не привязаны к lifecycle документа.**  
    `current` и timer глобальны; нет initial publish и cleanup при destroy. Переключение документа через `setState` само не вызывает этот listener, а последующая reconfigure-транзакция отсекается условием. Если focus не менялся, toolbar сохраняет состояние предыдущего документа до движения каретки. Предложение: небольшой `ViewPlugin` с initial publish, обновлением и отменой timer в `destroy`.

11. **Стоит поправить — [active.ts:73](</G:/Claude Projects/md reader/src/editor/active.ts:73>): regex fallback подсвечивает форматы внутри code и URL.**  
    В `` `==text==` `` одновременно активны code и highlight; `[[…]]` и list markers внутри fenced code тоже распознаются как форматирование. `toggleHighlight` аналогично способен изменить выделенный участок link destination, испортив адрес. Предложение: перед fallback и командой проверять code/URL context; label ссылки обрабатывать отдельно. Стоимость `resolveInner` здесь не главный риск — fallback дополнительно сканирует всю текущую строку.

12. **Стоит поправить — [images.ts:185](</G:/Claude Projects/md reader/src/editor/images.ts:185>): image command открывает dialog в read-only и не ловит ошибку `open`.**  
    Guard появляется только в `dropImages`, после выбора файла. Ошибка самого dialog уходит в unhandled rejection, поскольку вызывающие места используют `void`. Предложение: проверить `view.state.readOnly` перед `open`, охватить dialog общим `try/catch` и повторно проверить доступность целевого editor перед вставкой.

13. **Вкусовщина — [FormatBar.tsx:40](</G:/Claude Projects/md reader/src/ui/FormatBar.tsx:40>): команды и shortcuts описаны в трёх местах.**  
    Toolbar повторяет registry и keymap, а `liveEditor` дублирует уже существующий `live` в `EditView`. Для одного разработчика это скорее будущая рассинхронизация, чем полезная независимость. Предложение: использовать command IDs для toolbar и один источник editor reference; отдельный framework для этого не нужен.
