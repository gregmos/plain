Ревью `54129c7..f32704f`, без изменений файлов и запуска тестов. Native-поведение проверял по исходникам установленных Tauri/Wry/Muda/Tao; живого запуска на Mac не было.

**Критично**

1. **[src/app/close.ts:127](</G:/Claude Projects/md reader/src/app/close.ts:127>), [src-tauri/src/lib.rs:270](</G:/Claude Projects/md reader/src-tauri/src/lib.rs:270>) — `⌘Q` обходит защиту несохранённых правок.**  
   Guard обрабатывает только `CloseRequested`. Default menu вызывает native `terminate:`, а Tao 0.35.3 обрабатывает уже `applicationWillTerminate`; это не последовательное закрытие окон через frontend. Диалога `save / don't save / cancel` нет, последние правки могут не успеть попасть в debounce draft.  
   **Предложение:** заменить native Quit управляемым пунктом, направленным в общий сценарий сохранения и завершения. Отдельно проверить Dock → Quit. Одной подписки на `ExitRequested` для этого native-пути недостаточно. Здесь требование §13a оставить default menu конфликтует с §8.

2. **[src/app/paths.ts:22](</G:/Claude Projects/md reader/src/app/paths.ts:22>) — разные Unix-файлы получают один document ID.**  
   `pathKey()` безусловно заменяет `\` на `/` и вызывает `toLowerCase()`. На case-sensitive APFS `A.md` и `a.md` — разные файлы; имя с literal backslash тоже допустимо. `openPaths()` принимает совпадение ID за уже открытый документ. Коллизия затрагивает buffers, drafts и Save As. Аналогичные предположения остались в `read/links.ts` и `library/tree.ts`.  
   **Предложение:** ограничить Windows-нормализацию платформой; на Unix использовать возвращённый Rust canonical path без изменения регистра и разделителей. Проверить два разных файла одновременно, включая Save As и recovery.

3. **[src-tauri/src/fs.rs:384](</G:/Claude Projects/md reader/src-tauri/src/fs.rs:384>) — save уничтожает часть metadata и может изменить доступ к файлу.**  
   Новый inode получает владельца temp-файла; исходные owner/group, ACL, xattr, Finder tags и `com.apple.quarantine` не переносятся. Например, исчезновение ограничивающего ACL при сохранённом permissive mode расширяет доступ. Даже обязательный по §13a перенос mode выполняется best effort: ошибки `metadata` и `set_permissions` скрываются.  
   **Предложение:** определить сохраняемую metadata и переносить её до commit с обработкой ошибок; если обязательные права сохранить нельзя — останавливать замену. Тест `a_rename_commit_replaces_the_target_and_keeps_its_mode` сейчас вообще не проверяет mode.

4. **[src-tauri/src/fs.rs:390](</G:/Claude Projects/md reader/src-tauri/src/fs.rs:390>) — durability заканчивается до изменения имени.**  
   `sync_all()` вызывается до chmod и rename; после rename нет синхронизации каталога. Атомарная видимость замены не доказывает сохранение нового directory entry после power loss, включая APFS. Это относится также к drafts/state/history, использующим общий commit.  
   **Предложение:** перенести metadata перед последним file sync, добавить проверяемый macOS-протокол синхронизации directory metadata после rename. Ошибку после состоявшегося rename отличать от «файл не записан», иначе retry может получить конфликт с собственной записью. При этом не нужно механически добавлять `F_FULLFSYNC` вместо `sync_all`: Rust уже использует его на Apple. [Исходник Rust](https://raw.githubusercontent.com/rust-lang/rust/1.89.0/library/std/src/sys/fs/unix.rs), [семантика flush у Apple](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/fsync.2.html).

**Стоит поправить**

5. **[src/app/registry.ts:141](</G:/Claude Projects/md reader/src/app/registry.ts:141>), [registry.ts:285](</G:/Claude Projects/md reader/src/app/registry.ts:285>) — конфликты с native menu.**  
   `⌘W` принадлежит Close Window, поэтому вместо закрытия текущего документа запускается закрытие всего окна. `⌘H` принадлежит Hide, поэтому Replace скрывает приложение. Frontend `preventDefault()` не решает перехват native accelerator.  
   **Предложение:** согласовать native Close с `closeActive()` либо выбрать документу другой chord; Replace перенести, например, на `⌘⌥F`. Default menu также владеет `⌃⌘F`, но там действие совпадает. `⌘,` в прочитанном default menu отсутствует, поэтому аналогичного конфликта Settings нет. [Default menu Tauri](https://docs.rs/tauri/latest/src/tauri/menu/menu.rs.html).

6. **[src/app/registry.ts:296](</G:/Claude Projects/md reader/src/app/registry.ts:296>) — переключение документов превращено в переключение приложений.**  
   `Ctrl+Tab` и `Ctrl+Shift+Tab` парсятся как `⌘Tab` / `⌘⇧Tab`, которые забирает macOS.  
   **Предложение:** добавить в `macOverrides` буквальные `Control+Tab` и `Control+Shift+Tab`.

7. **[src/app/registry.ts:219](</G:/Claude Projects/md reader/src/app/registry.ts:219>) — клавиши zoom не зарегистрированы.**  
   Все три сочетания остались `hint`; `bindings()` их пропускает. Наличие `setZoom()` обеспечивает пункты меню, но не клавиши; WKWebView не предоставляет WebView2 accelerators.  
   **Предложение:** на macOS назначить `chord` для zoom in/out/reset. Проверять реальный zoom и восстановление из session.

8. **[src/app/settings.ts:34](</G:/Claude Projects/md reader/src/app/settings.ts:34>) — новые файлы на Mac всё ещё CRLF.**  
   `defaultEol()` нигде не участвует в формировании defaults. `loadSettings()` возвращает `DEFAULTS`, где `"crlf"`; `newDoc()` использует именно это значение. Settings при этом сообщает пользователю `lf here`. Тест проверяет лишь отдельную функцию.  
   **Предложение:** подключить platform default к defaults и parsing fallback, сохраняя явный пользовательский выбор. Проверить цепочку «нет settings.json → bootstrap → newDoc». Существующие документы и drafts должны сохранять собственный EOL.

9. **[src/app/commands.ts:592](</G:/Claude Projects/md reader/src/app/commands.ts:592>) — `window.print()` не подключён к native printing WKWebView.**  
   В Wry 0.55.1 есть отдельный native `print()`, но его UI delegate не реализует обработчики JavaScript print. Поэтому вызов может завершиться без диалога и без исключения; `catch` этого не обнаружит. Это вывод по исходникам, не результат запуска.  
   **Предложение:** использовать Tauri `Webview::print()` через Rust command и явно организовать восстановление режима, не полагаясь исключительно на DOM `afterprint`. [Путь обработки print в WebKit](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebKit/UIProcess/Cocoa/UIDelegate.mm).

10. **[src/ui/QuickSearch.tsx:156](</G:/Claude Projects/md reader/src/ui/QuickSearch.tsx:156>) — `⌘↩` не открывает результат в edit.**  
    Осталась проверка `event.ctrlKey`; строка 208 показывает literal `ctrl ↵`.  
    **Предложение:** проверять primary modifier общей функцией, отображать через `chordText("Ctrl+Enter")`, использовать `event.code`. В ReadView уже проверяются оба modifier; paste изображений работает через `paste`, поэтому отдельная замена `Ctrl+V` там не требуется.

11. **[src/app/registry.ts:343](</G:/Claude Projects/md reader/src/app/registry.ts:343>), [README.md:64](</G:/Claude Projects/md reader/README.md:64>) — history shortcuts расходятся с нормой и документацией.**  
    Реализованы `⌘⌥←/→`, тогда как §13a и README обещают `⌘[/]`. Это сознательное изменение из комментария к коду, но формально несоответствие осталось.  
    **Предложение:** согласовать выбор с ТЗ и README; если возвращать brackets, одновременно разрешить конфликт с editor indent, иначе одно сочетание будет иметь двух владельцев.

12. **[src-tauri/src/fs.rs:267](</G:/Claude Projects/md reader/src-tauri/src/fs.rs:267>) — `read_only` не отражает effective access.**  
    Уточнение к вопросу: Rust проверяет **все три write bits**, не только owner-write. ACL, текущего владельца/group membership и read-only mount он не учитывает. Возможны как доступный editor с ошибкой save, так и запрет редактирования файла, доступного через ACL.  
    **Предложение:** сохранить mode-based значение как явно ограниченный признак либо добавить effective-access проверку для UX. Окончательное решение всё равно принимать по результатам операций; atomic replace зависит также от прав каталога. [Документация Rust](https://doc.rust-lang.org/stable/std/fs/struct.Permissions.html#method.readonly).

13. **[src-tauri/src/fs.rs:390](</G:/Claude Projects/md reader/src-tauri/src/fs.rs:390>) — hard links молча расходятся.**  
    Rename заменяет только одно имя новым inode; остальные hard links продолжают показывать старый текст. `canonicalize()` такие имена не объединяет.  
    **Предложение:** при `nlink > 1` явно предупреждать или предлагать Save As. Сохранить одновременно atomic replacement и обновление всех hard links этим алгоритмом нельзя; переходить на in-place запись вопреки §8 не следует.

14. **[README.md:62](</G:/Claude Projects/md reader/README.md:62>) — инструкция первого запуска устарела для Sequoia.**  
    Начиная с macOS 15 Control/right-click → Open больше не обходит Gatekeeper для такого приложения. Apple прямо указывает System Settings → Privacy & Security. `xattr -cr` дополнительно удаляет все extended attributes, а не только quarantine.  
    **Предложение:** основной путь — попытка запуска → Privacy & Security → Open Anyway. Если оставлять Terminal-вариант, использовать адресное `xattr -dr com.apple.quarantine /Applications/Plain.app`. Уточнить «ad-hoc signed, без Developer ID/notarization». Исправление требуется и в §13a. [Объявление Apple для Sequoia](https://developer.apple.com/news/?id=saqachfa).

15. **[.github/workflows/macos.yml:17](</G:/Claude Projects/md reader/.github/workflows/macos.yml:17>) — write token выдан всему build job, включая dispatch.**  
    `contents: write` распространяется и на `npm ci`, тесты, сборку; checkout по умолчанию сохраняет credentials. Для artifact-only запуска это лишнее.  
    **Предложение:** build/test с `contents: read` и `persist-credentials: false`; публикация — отдельный tag-only job с write permission. Дополнительно: dispatch, запущенный на теге, тоже удовлетворяет `startsWith(github.ref, 'refs/tags/')` и публикует release, вопреки комментарию «manual run only builds». Если это нежелательно, проверять также `github.event_name`.

По остальным спорным пунктам оснований для отдельных дефектов не нашёл: `to_file_path()` декодирует percent-encoding/кириллицу; paths/folders разделены, очередь переживает отсутствие listener; single-instance 2.4.4 имеет macOS-реализацию. `ext/name/role` корректны, `mimeType` не обязателен; `beside_exe = None` и сигнатуры assoc согласованы. `MacIntel` подходит текущему detector; Highlight fallback допускает macOS 13; idle централизован. `⌥↑/↓` и `⌥⇧↑/↓` остаются в CodeMirror keymap. Spellcheck/context menu требуют живой проверки словарей и suggestions.

Пустой `tagName` при отсутствии `releaseId` действительно не создаёт release — это подтверждается [исходником tauri-action](https://raw.githubusercontent.com/tauri-apps/tauri-action/v0/src/index.ts). Путь artifact и workspace cache соответствуют universal target. Другой том сам по себе не создаёт EXDEV, поскольку temp находится рядом с target; rename файла поверх каталога завершится ошибкой, однако текущий document-save оставит staged temp без cleanup и без сообщения о его пути.

Вкусовщину отдельно не включал.
