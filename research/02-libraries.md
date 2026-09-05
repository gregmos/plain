# 02 — Готовые библиотеки и компоненты

**Проект:** десктопный Markdown reader/editor (Windows 11 в приоритете, кроссплатформенность желательна)
**Режимы:** Read (рендер) / Edit (raw + подсветка + номера строк) / Rich (WYSIWYG, bubble toolbar, slash-команды)
**Плюс:** vault-библиотека файлов, теги, quick search Ctrl+K, outline, backlinks
**Стиль:** минимализм, IBM Plex Mono, light/dark
**Лицензии:** любые (проект некоммерческий, GPL допустим)
**Принцип:** не переписывать заново то, что уже есть.

**Дата проверки версий: 2026-09-05.**

---

## Методика и легенда

Версии и даты получены прямыми запросами к реестрам:

- npm — `https://registry.npmjs.org/<pkg>` (поля `dist-tags.latest` и `time[latest]`);
- crates.io — `https://crates.io/api/v1/crates/<crate>` (`max_stable_version` + дата версии);
- GitHub — звёзды, дата последнего коммита и последний релиз через shields.io API;
- размеры пакетов — `data.jsdelivr.com/v1/packages/npm/...` (это **распакованный размер npm-пакета целиком**, включая sourcemaps и все сборки; он НЕ равен размеру в бандле — там, где важен реальный вес, это оговорено отдельно).

Статус поддержки:

| Метка | Критерий |
|---|---|
| **Активный** | релиз или коммиты за последние ~3 месяца |
| **Замедленный** | последняя активность 3–18 месяцев назад, но проект рабочий |
| **Заброшен** | >18 месяцев без активности либо явный deprecated/archived |

Вердикт: **Рекомендовано** / **Альтернатива** / **Отклонено**.

Пометка «не проверено» стоит там, где данные не удалось подтвердить прямым запросом.

Качественные утверждения (поведение, баги, подводные камни) проверялись прямыми запросами к GitHub Issues/PR, официальной документации и исходникам пакетов — конкретные номера issue и ссылки приведены по месту. Там, где подтверждения найти не удалось, стоит явная пометка «не проверено» / «не найдено», и такие места собраны в разделе «Риски».

> Отдельная методологическая заметка, которую стоит помнить при перепроверке: автоматическая суммаризация веб-страниц систематически «исправляла» даты 2026 года на 2024/2025. Все даты в этом документе получены разбором сырого JSON реестров, а не пересказом страниц.

---

## A. Оболочка приложения

### Кандидаты

| Библиотека | Назначение | Версия / дата | Лицензия | Звёзды | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|---|
| **Tauri** | app shell на системном WebView (WebView2 на Windows) | crate `tauri` **2.11.5**, 2026-07-01; `@tauri-apps/api` **2.11.1**, 2026-06-17; `@tauri-apps/cli` **2.11.4**, 2026-06-28 | MIT OR Apache-2.0 | 111k | Активный (коммиты 2026-09) | Инсталлятор единицы МБ; низкий RSS; Rust-бэкенд даёт Tantivy/notify/comrak/trash/encoding_rs «бесплатно»; богатая плагин-экосистема (updater, single-instance, deep-link, store, global-shortcut, fs, dialog, clipboard); строгая capability-модель доступа к ФС; `bundle.fileAssociations` из коробки | WebView2 = движок Edge, версия не под контролем приложения; нет headless-Chromium API (печать в PDF решается обходами); отладка Rust+TS двухслойная; сборка требует MSVC toolchain | **Рекомендовано** |
| Electron | app shell с собственным Chromium | **44.2.0**, 2026-09-04 (внутри Chromium 152.0.7977.76, Node.js 24.20.0) | MIT | 123k | Активный (релизы каждые ~8 недель) | Полный контроль над Chromium: `printToPDF`, `webContents`, spellchecker API с русским словарём, DevTools; максимум готовых рецептов | Сборка «Hello World» ≈384 МБ (см. бенчмарк ниже); обновления Chromium = регулярный ребилд; для «минималистичного ридера» избыточен | **Альтернатива** (запасной вариант, если печать в PDF, rich-text-буфер или spellcheck станут блокерами) |
| Wails | Go + системный WebView | v2: **v2.14.0**, 2026-08-10; v3: **v3.0.0-beta.16**, 2026-08-29 (**бета**) | MIT | 36k | Активный | Лёгкий, как Tauri; Go проще Rust | Экосистема Go для markdown/поиска слабее, чем Rust (нет аналога Tantivy); плагинов под задачи (updater, deep-link, file assoc) меньше; **v3 всё ещё в бете** — мейнтейнеры пишут «API стабилен, но возможны проблемы до финального 3.0» | **Отклонено** — выигрыша перед Tauri нет, а готовых кирпичей меньше |
| Neutralinojs | сверхлёгкий shell | **v6.9.0**, 2026-07-24 (+ rolling nightly) | MIT | 8.6k | Активный | Минимальный рантайм (сборка ≈2 МБ), без Node и без Rust | Очень тонкий API: нет нормального watcher, нет updater-подписи, нет file associations; всё тяжёлое пришлось бы писать на JS в webview; по бенчмарку — самое **прожорливое** по памяти (≈497 МБ) | **Отклонено** — противоречит принципу «не переписывать» |
| Flutter (desktop) | нативный UI | **3.47.2** (стабильный канал; **GitHub Releases не отражает актуальную версию** — Flutter перестал ими пользоваться с начала 2024, смотреть docs.flutter.dev) | BSD-3-Clause | 179k | Активный | Один код на все платформы, свой рендерер | Текстовый редактор с богатым текстом на Flutter — это **написать редактор с нуля**: нет CodeMirror/ProseMirror; markdown-рендер бедный; IME и выделение текста исторически проблемные | **Отклонено** |
| Avalonia | .NET кроссплатформенный UI | **12.1.2**, 2026-09-02 (LTS-ветка: 11.3.20) | MIT | 31k | Активный | Отличный Windows-first UI, XAML, зрелый | Нет готового WYSIWYG-markdown и code-editor уровня CM6; AvaloniaEdit ≈ AvalonEdit — сильно скромнее CodeMirror 6 | **Отклонено** |
| .NET MAUI | нативный UI Microsoft | целевой **.NET 10** (тег 10.0.100 от 2026-08-20), превью .NET 11 | MIT | 23k | Активный | Официальная поддержка Windows через **WinUI 3**, считается продакшн-платформой | Кроссплатформа фактически мобильная; desktop-Linux нет; редакторов нет | **Отклонено** |
| egui / eframe | immediate-mode Rust GUI | **0.36.1**, 2026-08-07 | MIT OR Apache-2.0 | 30k | Активный | Очень быстрый старт, крошечный бинарник | Immediate mode непригоден для сложного rich-text: нет нормального выделения, IME, RTL, сложной вёрстки текста | **Отклонено** |
| iced | retained-mode Rust GUI | **0.14.0**, 2025-12-07 | MIT | 31k | Активный | Elm-архитектура, приятный API | Rich-text/редактор пришлось бы писать самому; экосистема виджетов узкая | **Отклонено** |
| gpui | GPU UI-фреймворк из Zed | crate `gpui` **0.2.2**, 2025-10-22 | Apache-2.0 | (Zed: 90k) | Активный, но API нестабильный | Реально быстрый, доказан в Zed | Публичный крейт молодой (0.2.x), документация минимальная, всё пишется с нуля | **Отклонено** |
| Slint | декларативный UI (Rust/C++/JS) | **1.17.1**, 2026-07-07 | GPL-3.0-only OR Royalty-free-2.0 OR коммерческая | 24k | Активный | Красивый DSL, лёгкий рантайм | Текстовый редактор — снова с нуля; тройное лицензирование (для некоммерческого проекта GPL-3.0 подойдёт, но это ограничение) | **Отклонено** |

### Аргументация выбора Tauri

**Размер — решающий аргумент, и он проверен.** По живому бенчмарк-репозиторию [Elanis/web-to-desktop-framework-comparison](https://github.com/Elanis/web-to-desktop-framework-comparison) (отметка «Last Updated: September 2026»), сборка «Hello World» под Windows x64:

| Framework | Размер сборки | Память (release) | Память (debug) | Время сборки |
|---|---|---|---|---|
| **Tauri** | **≈3 МБ** | ≈317 МБ | ≈489 МБ | ≈250 с (компиляция Rust) |
| Electron | ≈384 МБ | ≈278 МБ | ≈364 МБ | ≈11 с |
| Wails | ≈11 МБ | ≈323 МБ | ≈534 МБ | ≈5.7 с |
| Neutralino | ≈2 МБ | ≈497 МБ | ≈561 МБ | ≈0.3 с |

**Честная оговорка про память.** В этом бенчмарке Electron показывает **меньший** расход памяти, чем Tauri, Wails и Neutralino. Это контринтуитивно и, скорее всего, методологический артефакт (по-разному учитывается уже резидентный в системе процесс `msedgewebview2.exe` и амортизация shared-процессов Chromium). **Вывод, который можно защищать: преимущество Tauri безусловно только в размере дистрибутива (~100× меньше Electron), а не в памяти.** Независимых свежих замеров RAM/времени старта найти не удалось — если память критична, её нужно мерить на конкретном приложении, а не принимать на веру.

**Старт.** Rust-бинарник стартует за десятки миллисекунд, дальше время определяется инициализацией WebView2. Числа — *не проверено*.

**Tauri 3** на 2026-09-05 **не анонсирован** — ни в блоге, ни в roadmap. Есть экспериментальный `tauri-runtime-verso` (движок Servo/Verso вместо WebView2/WKWebView), но это дополнение, а не замена. Значит, ставка на 2.x безопасна и надолго.

**Доступ к ФС.** Ключевое преимущество: тяжёлые операции уходят в Rust — обход vault (`ignore`/`walkdir`), инкрементальный индекс (Tantivy), watcher (`notify`), атомарная запись (`tempfile`), корзина (`trash`), определение кодировки (`chardetng` + `encoding_rs`). В Electron всё это либо на Node (медленнее), либо через нативные аддоны (боль со сборкой).

**Window chrome без рамки.** `decorations: false` + собственный титлбар с `data-tauri-drag-region`. **Известная проблема:** при этом ломаются Snap Layouts Windows 11 — issue [tauri#4531](https://github.com/tauri-apps/tauri/issues/4531) открыт с 2022-06-30 со статусом «upstream» (зависит от tao/winit). Детали и обходы — см. риск R-2. Параметр `shadow` на Windows: у декорированных окон тень есть всегда; у `decorations:false` при `shadow:true` появляется 1px белая рамка и скруглённые углы Win11. Есть также `titleBarStyle`: `Visible` / `Transparent` / `Overlay`.

**File associations.** `bundle.fileAssociations` в `tauri.conf.json`: `ext` (обязательно), `name`, `description` (**Windows-only**, показывается в колонке «Тип» Проводника), `mimeType`, `role` (по умолчанию `"Editor"`). Путь открытого файла на Windows приходит **аргументом командной строки нового процесса** — отдельного IPC-канала нет; официальные доки deep-link это подтверждают: «On Linux and Windows deep links are delivered as a command line argument to a new app process». Чтобы не плодить процессы, обязателен `tauri-plugin-single-instance`, чей колбэк получает `argv` второго запуска.

**Автообновление.** `tauri-plugin-updater` 2.11.0 (2026-08-31): ключи через `tauri signer generate`, **подписи отключить нельзя**; JSON-манифест с `version`, `platforms["windows-x86_64"].url` и `.signature`. Известное ограничение прямо из доков: **«On Windows the application is automatically exited when the install step is executed due to a limitation of Windows installers»** — значит, нужно корректно сохранять все открытые документы до запуска установки.

**Печать в PDF.** Штатного API у Tauri нет — открытые фича-реквесты [tauri#4917](https://github.com/tauri-apps/tauri/issues/4917) и [tauri#12284](https://github.com/tauri-apps/tauri/issues/12284). `window.print()` внутри WebView2 работает и открывает системный диалог. Нативный `ICoreWebView2_7::PrintToPdf` доступен из Rust: крейт `webview2-com` экспортирует `PrintToPdfCompletedHandler` / `PrintToPdfStreamCompletedHandler`. Подробности — раздел J и риск R-5.

**Тюнинг WebView2.** Через `tauri::WebviewWindowBuilder::additional_browser_args(...)` можно передавать флаги Chromium (например, `--disable-features=msWebOOUI,msPdfOOUI`, `--enable-features=...`, отключение автозаполнения/сглаживания). Через `with_webview(|w| ...)` + крейт `webview2-com` **0.39.1** (2026-03-11) доступны COM-интерфейсы ICoreWebView2 — там же находится `PrintToPdf`.

### Что нужно установить для Tauri 2 на Windows 11

Источник: [v2.tauri.app/start/prerequisites](https://v2.tauri.app/start/prerequisites/)

1. **Microsoft C++ Build Tools** — Visual Studio Build Tools, при установке отметить workload **«Desktop development with C++»** (компилятор MSVC + Windows SDK). Без него не пройдёт линковка.
2. **Rust toolchain** — `rustup`, важно чтобы **MSVC** был выбран как default host triple (`x86_64-pc-windows-msvc`, не `-gnu`). Проверка: `rustup default stable-msvc`. Минимальная версия Rust для `tauri-plugin-updater` — **1.77.2**; для остального — свежий stable.
3. **WebView2 Runtime** — **предустановлен**: Microsoft прямо пишет «The Evergreen WebView2 Runtime will be included as part of the Windows 11 operating system» ([docs](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)); на Windows 10 — с версии 1803+.
4. **Node.js** — LTS, нужен для фронтенд-сборки (Vite).
5. **VBSCRIPT** (опционально) — только если собирается **MSI**-инсталлятор; включается в Settings → Apps → Optional features. Для NSIS не нужен.
6. `cargo install tauri-cli --version "^2"` либо npm-пакет `@tauri-apps/cli` 2.11.4 (достаточно одного).

Варианты `bundle.windows.webviewInstallMode` ([docs](https://v2.tauri.app/distribute/windows-installer/)):

| Режим | Нужен интернет | Влияние на размер | Комментарий |
|---|---|---|---|
| `downloadBootstrapper` (по умолчанию) | да, при установке | ~0 МБ (скачивает ~2 МБ бутстрап) | подходит для Windows 11 |
| `embedBootstrapper` | да, при установке | **+~1.8 МБ** | безопаснее для офлайн-старта установки |
| `offlineInstaller` | нет | **+~127 МБ** | полная офлайн-поставка |
| `fixedVersion` | нет | **+~180 МБ** по докам Tauri; Microsoft для Fixed Version binaries указывает **«over 250 MB»** | детерминированный движок, но **обновление Runtime становится вашей ответственностью** — требуется перевыпуск сборки |
| `skip` | нет | 0 МБ | приложение не запустится без рантайма |

**Для Windows 11 — `downloadBootstrapper` (или `embedBootstrapper` для надёжности).**

### Итоговый выбор — A

**Tauri 2.11.x** как оболочка. Electron остаётся зафиксированным запасным вариантом на случай, если печать в PDF или системный spellcheck окажутся блокерами.

Установка (Rust, `src-tauri/Cargo.toml`):

```toml
tauri = { version = "2.11", features = ["protocol-asset", "tray-icon"] }
tauri-build = "2.6"
tauri-plugin-fs = "2.5"
tauri-plugin-dialog = "2.7"
tauri-plugin-opener = "2.5"
tauri-plugin-store = "2.4"
tauri-plugin-clipboard-manager = "2.3"
tauri-plugin-global-shortcut = "2.3"
tauri-plugin-single-instance = "2.4"
tauri-plugin-deep-link = "2.4"
tauri-plugin-updater = "2.11"
tauri-plugin-window-state = "2.4"
tauri-plugin-process = "2.3"
tauri-plugin-os = "2.3"
tauri-plugin-log = "2.9"
tauri-plugin-persisted-scope = "2.3"
tauri-plugin-http = "2.6"
```

npm-часть:

```
@tauri-apps/api@2.11.1
@tauri-apps/cli@2.11.4
@tauri-apps/plugin-fs@2.5.2
@tauri-apps/plugin-dialog@2.7.3
@tauri-apps/plugin-opener@2.5.5
@tauri-apps/plugin-store@2.4.4
@tauri-apps/plugin-clipboard-manager@2.3.3
@tauri-apps/plugin-global-shortcut@2.3.2
@tauri-apps/plugin-deep-link@2.4.10
@tauri-apps/plugin-updater@2.11.0
@tauri-apps/plugin-window-state@2.4.1
@tauri-apps/plugin-process@2.3.1
@tauri-apps/plugin-os@2.3.2
@tauri-apps/plugin-log@2.9.1
@tauri-apps/plugin-http@2.6.0
```

Версии всех плагинов проверены на crates.io/npm 2026-09-05; большинство обновлено 2026-08-31 (общий релиз-поезд плагинов).

---

## B. Raw-редактор (режим Edit)

### Кандидаты

| Библиотека | Назначение | Версия / дата | Лицензия | Звёзды | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|---|
| **CodeMirror 6** | модульный редактор кода/текста | ядро: `@codemirror/state` **6.7.4** (2026-09-04), `@codemirror/view` **6.43.11** (2026-09-03), `@codemirror/commands` **6.11.0** (2026-08-16), `@codemirror/language` **6.12.4** (2026-06-25) | MIT | 7.8k (codemirror/dev) | Активный — релизы 2026-09-03/04 | Крошечное ядро, всё через расширения; отличная markdown-грамматика на Lezer; декорации позволяют сделать live-preview; viewport-рендеринг тянет большие файлы; полный контроль над темой через CSS-переменные | Крутая кривая обучения (StateField/ViewPlugin/Facet); нет «батареек» — table formatting, spellcheck подключать самому; IME + декорации требуют аккуратности (см. R-7) | **Рекомендовано** |
| Monaco | редактор из VS Code | **0.56.0**, 2026-07-20 | MIT | 47k | Активный | Готовые IntelliSense, minimap, diff-editor, мультикурсор | Распакованный npm-пакет **~98 МБ** (95 МБ JS); в бандле — сотни КБ + воркеры; заточен под код, а не под прозу: soft-wrap и типографика хуже; кастомизация темы под «минимализм» неудобна; RTL/IME исторически слабее | **Отклонено** — вес и «кодовость» против минималистичного ридера |
| Ace | классический веб-редактор | `ace-builds` **1.44.0**, 2026-05-11 | BSD-3-Clause | 27k | Активный, но legacy | Стабилен, много тем | Архитектура 2010-х, нет Lezer-грамматик, экосистема расширений замерла; для live-preview декораций нет | **Отклонено** |

> **Организационный факт, который надо знать заранее.** Репозиторий `codemirror/dev` **архивирован на GitHub 2026-04-15**; Marijn Haverbeke перенёс баг-трекер на собственный инстанс Forgejo — **https://code.haverbeke.berlin/codemirror/dev**. Пакеты на npm выходят как раньше (релизы 2026-09-03/04), проект живее некуда, но **искать и заводить issues нужно там, а не на GitHub**. Звёздный счётчик GitHub (7.8k) с этого момента заморожен и больше не отражает популярность.

### Конкретные пакеты CodeMirror 6

| Пакет | Версия | Дата | Зачем |
|---|---|---|---|
| `@codemirror/state` | 6.7.4 | 2026-09-04 | ядро состояния |
| `@codemirror/view` | 6.43.11 | 2026-09-03 | рендер, `lineNumbers()`, `EditorView.lineWrapping`, декорации |
| `@codemirror/commands` | 6.11.0 | 2026-08-16 | `defaultKeymap`, `history()`, `indentWithTab` |
| `@codemirror/language` | 6.12.4 | 2026-06-25 | `foldGutter()`, `codeFolding()`, `syntaxHighlighting`, `HighlightStyle` |
| `@codemirror/lang-markdown` | 6.5.2 | 2026-08-04 | markdown-режим, `insertNewlineContinueMarkup` (продолжение списков), `markdownKeymap`, `deleteMarkupBackward` |
| `@lezer/markdown` | 1.7.2 | 2026-07-15 | сама грамматика; расширения GFM: `Table`, `TaskList`, `Strikethrough`, `Autolink`, `Superscript`, `Subscript`, `Emoji`, `GFM` (набор) + API `MarkdownExtension` для своих (wikilinks, footnotes, highlight `==...==`) |
| `@codemirror/search` | 6.7.2 | 2026-08-31 | панель поиска/замены, `highlightSelectionMatches` |
| `@codemirror/autocomplete` | 6.20.3 | 2026-06-03 | `closeBrackets()` (автопары), автодополнение для `[[wikilink]]`, `#тег`, slash-команд |
| `@codemirror/lint` | 6.9.7 | 2026-06-09 | подчёркивание — сюда же удобно вешать spellcheck-диагностику |
| `@codemirror/language-data` | 6.5.2 | 2025-10-23 | ленивая загрузка грамматик для code fences внутри markdown |
| `@lezer/highlight` | 1.2.3 | 2025-10-26 | теги подсветки |
| `@lezer/common` | 1.5.2 | 2026-04-08 | обход синтаксического дерева (нужно для outline и live-preview) |
| `@replit/codemirror-vim` | 6.4.0 | 2026-07-29 | vim-mode. Активный, MIT — на сегодня фактический стандарт для CM6 | 
| `@replit/codemirror-indentation-markers` | 6.5.3 | 2024-07-15 | вертикальные направляющие отступов. Замедленный, но пакет стабильный и крошечный |

### Как закрываются требования из ТЗ

| Требование | Решение | Готово из коробки? |
|---|---|---|
| Номера строк | `lineNumbers()` из `@codemirror/view` | да |
| Soft wrap | `EditorView.lineWrapping` | да |
| Автопары | `closeBrackets()` из `@codemirror/autocomplete` | да |
| Продолжение списков (`- `, `1. `, `- [ ] `) | `insertNewlineContinueMarkup` + `markdownKeymap` из `@codemirror/lang-markdown` | да |
| Свёртка (fold) | `codeFolding()` + `foldGutter()`; для markdown-заголовков — `foldNodeProp` уже задан в lang-markdown для секций | да |
| Поиск | `search({ top: true })` + `openSearchPanel` | да |
| Vim | `@replit/codemirror-vim` | да |
| Форматирование таблиц | **нет готового пакета для CM6** — писать самому поверх `markdown-table` 3.0.4 (см. раздел N) | нет |
| Spellcheck | нативный `spellcheck` атрибут contenteditable (WebView2) или свой слой через `@codemirror/lint` | частично |
| Inline-превью mermaid/KaTeX | своими декорациями (`Decoration.replace` + `WidgetType`) — базис для «hybrid live preview» | нет |

### Итоговый выбор — B

**CodeMirror 6.** Установка:

```
npm i @codemirror/state@6.7.4 @codemirror/view@6.43.11 @codemirror/commands@6.11.0 \
      @codemirror/language@6.12.4 @codemirror/lang-markdown@6.5.2 @codemirror/search@6.7.2 \
      @codemirror/autocomplete@6.20.3 @codemirror/lint@6.9.7 @codemirror/language-data@6.5.2 \
      @lezer/markdown@1.7.2 @lezer/highlight@1.2.3 @lezer/common@1.5.2 \
      @replit/codemirror-vim@6.4.0 @replit/codemirror-indentation-markers@6.5.3
```

Мета-пакет `codemirror` 6.0.2 (2025-06-19) ставить **не нужно** — это просто `basicSetup`, который для кастомного UI всё равно придётся разбирать на части.

---

## C. WYSIWYG (режим Rich)

### Кандидаты

| Библиотека | База | Версия / дата | Лицензия | Звёзды | Статус | Round-trip MD | Bubble / Slash из коробки | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|---|---|---|
| **Milkdown + Crepe** | ProseMirror + remark | **7.22.1**, 2026-08-12 | MIT | 12k | Активный | remark-based, GFM ок; **front matter не поддерживается** ([#1712](https://github.com/Milkdown/milkdown/issues/1712), open); есть подтверждённые баги сериализации (см. R-1) | **Да, оба** | Crepe — готовый редактор, а не конструктор. Точный список фич (проверено по `CrepeFeature` enum в дистрибутиве 7.22.1): `toolbar` (bubble при выделении), `block-edit` (slash-меню + drag handle), `table`, `latex`, `image-block`, `link-tooltip`, `code-mirror` (подсветка кода в блоках), `list-item`, `cursor`, `placeholder`, `top-bar`, `ai`. Темы: `crepe`/`crepe-dark`, `frame`/`frame-dark`, `nord`/`nord-dark` + `common`. Пакет 3.5 МБ распакованный, 0.8 МБ JS, 134 КБ CSS — самый компактный из «готовых» | Сериализация нормализует markdown; нет front matter, wikilinks; **сносок нет именно в Crepe** ([#2008](https://github.com/Milkdown/milkdown/issues/2008), open, с 2025-07); API плагинов Milkdown нетривиален | **Рекомендовано** |
| **Tiptap 3** | ProseMirror | `@tiptap/core` **3.31.3**, 2026-09-04; **`@tiptap/markdown` 3.31.3** (2026-09-04) | MIT | 38k | Очень активный (коммиты вчера) | **С версии 3.7.0 у Tiptap есть ОФИЦИАЛЬНОЕ markdown-расширение `@tiptap/markdown`** — построено на `marked` (`marked: ^17`), даёт `editor.getMarkdown()` и `contentType: 'markdown'` для `setContent`/`insertContent`, настройки отступов, кастомный инстанс `marked`, отдельный `htmlTagDetection` util. Сторонний `tiptap-markdown` 0.9.0 автором **официально объявлен deprecated**: «Tiptap released a markdown extension in 3.7.0, please prefer using the official extension» | BubbleMenu — да; slash — примеры, а не готовый UI | Огромное сообщество и документация; лучшая расширяемость; **`@tiptap/extension-table-of-contents` и `@tiptap/extension-drag-handle` — MIT и бесплатны** (проверено: публичные npm-пакеты 3.31.3) | Markdown всё ещё вторичен (модель — HTML/PM-документ, а `marked` слабее remark по round-trip); slash-меню и вся оболочка пишутся руками; платными остаются Comments (пакет `@tiptap/extension-comments` **отсутствует в публичном npm** — 404), Collaboration, Tracked Changes, импорт/экспорт DOCX/PDF, AI (тарифы от $59/мес) | **Сильная альтернатива** — вырос из «отклонить» после появления официального markdown-расширения |
| BlockNote | ProseMirror | `@blocknote/core` **0.54.0**, 2026-08-13 | **MPL-2.0** | 10k | Активный | API прямо называется `blocksToMarkdownLossy()`; в документации дословно: «converting to and from Markdown is a **lossy** conversion», и «Supporting every Markdown dialect … is not a goal». Цвета, подчёркивание, выравнивание теряются намеренно. Есть свежая работа над качеством: PR [#2624](https://github.com/TypeCellOS/BlockNote/pull/2624) заменил unified/remark на собственный парсер, плюс фиксы round-trip таблиц (#2720) и tight-списков (#2715) | Да, оба (Notion-like) | Ближе всего к «Notion из коробки»; для интеропа документация рекомендует HTML, а не markdown | Lossy по дизайну — неприемлемо, когда файл на диске источник истины; MPL-2.0 (для некоммерческого проекта не проблема) | **Отклонено** для модели «markdown = источник истины» |
| ProseMirror напрямую | — | `prosemirror-model` **1.25.11** (2026-07-11), `prosemirror-markdown` **1.13.7** (2026-08-31), `prosemirror-view` **1.42.3** (2026-08-24) | MIT | 8.7k | Активный | `prosemirror-markdown` на markdown-it — предсказуемый, но покрывает только CommonMark | Нет | Максимальный контроль | Это и есть «переписать заново» — bubble/slash/таблицы/картинки писать самому | **Отклонено** как основной путь (но остаётся фундаментом под Milkdown) |
| Lexical | своё ядро (Meta) | `lexical` / `@lexical/markdown` **0.50.0**, 2026-09-02 | MIT | 24k | Очень активный | Базовые element-трансформеры: `UNORDERED_LIST`, `CODE`, `HEADING`, `ORDERED_LIST`, `QUOTE` — **таблиц в списке нет** (поддержка через regex `TABLE_ROW_REG_EXP`). Сама Meta признаёт проблемы: PR [#8794](https://github.com/facebook/lexical/pull/8794) (смержен 2026-07-08) вводит `@lexical/mdast` на micromark/mdast как замену, мотивируя тем, что старая система «diverges from CommonMark/GFM in edge cases» и ломает вложенные списки при импорте. `@lexical/mdast` 0.50.0 опубликован, но **помечен experimental** | Нет (есть примеры плагинов) | Быстрое ядро, хорошая работа с большими документами | 0.x с ломающими изменениями; markdown вторичен; замена markdown-слоя ещё экспериментальна; UI писать самому | **Альтернатива** |
| Remirror | ProseMirror | **3.0.3**, 2025-08-02 | MIT | 3.0k | Замедленный (коммиты июнь 2026, релиз год назад) | remark-based | Частично | Богатый набор расширений | Проект теряет темп, сообщество ушло в Tiptap | **Отклонено** |
| Editor.js | своё (блоки JSON) | **2.31.6**, 2026-04-07 | Apache-2.0 | 32k | Активный | Нативный формат — JSON, markdown только через конвертеры → тяжёлые потери | Slash — да | Приятный блочный UX | Формат данных не markdown | **Отклонено** |
| Slate | своё ядро | `slate` **0.126.2** (2026-08-08), `slate-react` **0.126.4** (2026-08-25) | MIT | 32k | Активный | markdown только через сторонние сериализаторы (`remark-slate` и т. п. — заброшены) | Нет | Гибкость | Известная нестабильность на вводе/IME, всё UI — самому | **Отклонено** |
| Plate | Slate | пакет `@udecode/plate` **49.0.0** (2025-06-11) помечен **DEPRECATED**; переехал в `platejs` **53.3.11**, 2026-09-04 | MIT | 17k | Активный (под новым именем) | наследует проблемы Slate + сторонняя markdown-сериализация | Да, оба | Много готовых компонентов (shadcn-стиль) | Переименование пакета = миграционный риск; тянет React+Slate целиком; заточен под веб-приложения, не под локальные .md | **Отклонено** |
| Novel | Tiptap | **1.0.2**, 2025-01-18 | Apache-2.0 | 16k | **Замедленный/заброшен** (последний коммит январь 2025) | через Tiptap | Да, оба | Красивый Notion-like UX | Проект остановлен | **Отклонено** |
| TOAST UI Editor | своё | **3.2.2**, **2023-02-17** | MIT | 18k | **Заброшен** (последний коммит февраль 2023) | markdown + WYSIWYG синхронно — концептуально ровно то, что нужно | Нет slash | Двухпанельный markdown/WYSIWYG «из коробки» | 3.5 года без релизов | **Отклонено** |
| Vditor | своё (Lute, Go→wasm) | **4.0.0**, 2026-08-30 | MIT | 11k | Активный | Отличный: у Vditor есть режим «instant rendering» (WYSIWYG прямо в markdown) — то, что делает Typora | Частично | Единственный OSS с настоящим «Typora-режимом»; поддержка mermaid/KaTeX/footnotes встроена | Пакет 23.6 МБ распакованный (21 МБ JS + wasm); UI жёстко свой, минималистичную тему навязать трудно; документация в основном на китайском | **Альтернатива** (посмотреть на реализацию instant-rendering) |
| Cherry Markdown | своё | **0.11.10**, 2026-08-24 | Apache-2.0 | 4.9k | Активный | Двухпанельный, хороший GFM | Bubble — да | Много встроенных фич (диаграммы, таблицы, экспорт) | 50 МБ распакованный; UI/тема Tencent-стиля; не WYSIWYG в строгом смысле | **Отклонено** |
| Bytemd | Svelte + remark | **1.22.0**, 2025-02-12 | MIT | 1.4k | Замедленный | remark, честный | Нет | Аккуратный плагинный API | Не WYSIWYG (split-view), проект замедлился | **Отклонено** |
| HyperMD | CodeMirror 5 | **0.3.11**, **2018-10-07** | MIT | 1.6k | **Заброшен** (коммиты 2019) | — | — | Исторически первый «live preview на CodeMirror» | CM5, мёртв | **Отклонено** (но идея — прямой предок Obsidian Live Preview) |
| **atomic-editor** | CodeMirror 6 | `@atomic-editor/editor` **0.6.2**, 2026-07-11 | MIT | 136 | Активный | markdown = источник истины, потерь нет по определению | Нет (это слой рендеринга, не UI-оболочка) | **Самое прямое попадание в задачу из всего найденного:** заявлен как «CodeMirror 6 markdown editor with Obsidian-style inline live preview» — «raw syntax appears only on the line your cursor is on, then tucks itself away when you move on». Есть WYSIWYG-таблицы (click-to-edit ячейки), виджеты картинок, «stable height regardless of cursor position» (нет layout shift), экспорт низкоуровневых примитивов `inlinePreview` / `tables` / `wikiLinks`. Тесты Playwright + Vitest. Выделен из реального PKM-приложения | 136 звёзд, версия 0.6.x — нишевая библиотека без широкого adoption; риск «единственного мейнтейнера» | **Альтернатива / главный референс для фазы 2** |
| ink-mde | CodeMirror 6 | **0.34.0**, 2024-09-28 | MIT | 304 | Замедленный (коммиты июль 2026, релиз — 2024) | markdown = источник истины | Нет | «Hybrid plain-text rendering»: **не прячет синтаксис полностью**, а подсвечивает/украшает декорациями, оставляя markdown видимым. GFM, inline-превью картинок, drag&drop, vim, обёртки Vue/Svelte | v0 («minor version increments are breaking changes»), 31 открытый issue, год без релиза | **Альтернатива / референс-код** |
| codemirror-rich-markdoc | CodeMirror 6 | **0.0.2**, 2024-10-31 | MIT | 121 | **Заброшен** | — | Нет | Идея та же | Версия 0.0.2, два года без обновлений, и построен на **Markdoc**, а не на чистом CommonMark | **Отклонено** |
| rich-markdown-editor | ProseMirror | **11.21.3**, **2021-12-18** | BSD-3-Clause | 2.9k | **Заброшен** (архивирован в пользу Outline monorepo) | — | Да, оба (был пионером) | — | Мёртв | **Отклонено** |
| «Hybrid live preview» на CM6 своими декорациями | CodeMirror 6 | — | — | — | — | **Идеальный: файл и есть модель, потерь нет вообще** | Пишется самому (но bubble/slash — это ~300 строк) | Ноль расхождений между режимами; одна модель данных на Edit и Rich; лучший UX для markdown-пуристов (модель Obsidian) | Это единственный пункт, где придётся писать код: скрытие маркеров через `Decoration.replace`, виджеты для картинок/формул/таблиц | **Рекомендовано как стратегия «фаза 2»** |

### Рекомендация по режиму Rich

**Двухступенчатый план.**

1. **Фаза 1 — Milkdown Crepe 7.22.1.** Это единственный кандидат, который даёт *ровно то, что просит ТЗ*, без написания UI: плавающий тулбар выделения (`toolbar`), slash-меню (`block-edit`), таблицы, LaTeX, блоки картинок, подсветку кода. Лицензия MIT, размер приемлемый (0.8 МБ JS распакованных), проект активен (релиз 2026-08-12, коммиты — на прошлой неделе).

2. **Фаза 2 (по желанию) — live-preview на CodeMirror 6.** Если расхождения round-trip окажутся раздражающими, «Rich» переезжает на декорации CM6 поверх того же документа, что и в Edit. Тогда режимы Edit и Rich делят одну модель, и проблема сериализации исчезает как класс. Готовых «battle-tested» библиотек с тысячами звёзд под Obsidian-style live preview **не существует** — это проверено. Есть три нишевых проекта, и лучший из них: **`@atomic-editor/editor` 0.6.2** (MIT, 136 звёзд, активен) — можно либо взять как зависимость, либо использовать его примитивы (`inlinePreview`, `tables`, `wikiLinks`) как эталон архитектуры. Дополнительные референсы: **ink-mde** (более осторожный «hybrid» подход) и **HyperMD** (историческая архитектурная идея на CM5).

**Резервный вариант вместо Crepe — Tiptap 3 + `@tiptap/markdown`.** Появление официального markdown-расширения (3.7.0+) сильно улучшило позицию Tiptap. Его стоит рассматривать, если понадобится глубоко кастомизировать поведение редактора: экосистема, документация и темп разработки у Tiptap заметно сильнее. Цена — slash-меню, тулбар и всю оболочку придётся собрать самому, а `marked` под капотом даёт round-trip похуже remark.

**Архитектурное правило, снимающее главный риск:** источник истины — **текст .md на диске**. Rich-режим сериализует обратно **только если пользователь реально что-то в нём отредактировал** (dirty-флаг), и только изменённый документ. Тогда «нормализация форматирования» не расползается по всему vault.

**Front matter обрабатывается отдельным слоем** (см. раздел I): YAML-блок отрезается до передачи текста в Crepe и приклеивается обратно при сохранении. Это обязательно, т. к. в Milkdown front matter не поддерживается (issue #1712 открыт).

### Итоговый выбор — C

```
npm i @milkdown/crepe@7.22.1 @milkdown/kit@7.22.1 @milkdown/core@7.22.1
```

(`@milkdown/kit` — агрегатор пресетов/плагинов; `@milkdown/crepe` тянет ядро сам, ставить `core` явно нужно только при написании своих плагинов.)

Для фазы 2 — либо зависимость, либо исходник для чтения:

```
npm i @atomic-editor/editor@0.6.2      # Obsidian-style live preview на CM6
```

Резервный путь (если откажемся от Crepe):

```
npm i @tiptap/core@3.31.3 @tiptap/starter-kit@3.31.3 @tiptap/pm@3.31.3 @tiptap/markdown@3.31.3 \
      @tiptap/extension-drag-handle@3.31.3 @tiptap/extension-table-of-contents@3.31.3
```

**Не ставить `tiptap-markdown`** — автор объявил его deprecated в пользу официального `@tiptap/markdown`.

---

## D. Парсинг и рендер Markdown (режим Read)

### Кандидаты

| Библиотека | Назначение | Версия / дата | Лицензия | Звёзды | Статус | Позиции для sync-scroll | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|---|---|
| **markdown-it** | парсер + рендерер (JS) | **15.0.1**, 2026-08-27 | MIT | 22k | Активный (v15.0.0 — 2026-07-30) | **`token.map = [startLine, endLine]`** на всех блочных токенах — лучший в классе механизм для sync-scroll | 100% CommonMark; самый большой набор плагинов; быстрый; в v15 появились встроенные TypeScript-декларации (`@types/markdown-it` больше не нужен) и `markdown-it/browser` (готовые ESM/UMD-сборки); токены — плоский поток, легко переопределять `renderer.rules` | v15 — свежий мажор: **удалены subpath-экспорты `markdown-it/lib/*`**, `validateLink`/`normalizeLink` переехали из свойств в методы прототипа, `linkify-it` → v6 (fuzzy-links выключены по умолчанию), удалён `StateBlock#ddIndent` (старый `markdown-it-deflist` сломается). Старые плагины нужно проверять | **Рекомендовано** |
| remark / unified | AST-конвейер (mdast/hast) | `unified` **11.0.5** (2024-06-19), `remark-parse` **11.0.0** (2023-09-18), `remark-gfm` **4.0.1** (2025-02-10), `remark-stringify` **11.0.0** | MIT | 9k (remark) | Активный, но ядро стабилизировалось | `node.position` (start/end: line, column, offset) — полная позиционная информация | Настоящий AST (а не поток токенов) — незаменим для **программных правок**: обновление ссылок при переименовании, извлечение wikilinks/тегов/backlinks, сборка outline; огромная экосистема mdast-util-* | Медленнее markdown-it на рендер; `remark-stringify` нормализует форматирование (нельзя использовать для «сохранить как есть»); длинная цепочка зависимостей | **Рекомендовано (вторая роль: анализ, а не рендер)** |
| micromark | низкоуровневый парсер под remark | **4.0.2**, 2025-02-27 | MIT | — | Активный | да (через расширения) | Строгий CommonMark, маленький | Слишком низкий уровень для прикладного кода | **Отклонено** (используется транзитивно) |
| marked | быстрый парсер | **18.0.11**, 2026-08-24 | MIT | 37k | Очень активный | нет надёжного маппинга строк | Быстрый, маленький, простой API | Плагин-экосистема беднее markdown-it; исторически вольности с CommonMark; **нет `token.map`** → sync-scroll придётся костылить | **Отклонено** |
| comrak | CommonMark+GFM на Rust | **0.54.0**, 2026-07-12 | BSD-2-Clause | 1.7k | Активный | **`--sourcepos` / `render.sourcepos`** — атрибуты позиций прямо в HTML; есть `--sourcepos-chars` | **CommonMark 652/652 и GFM 670/670** (заявлено в README); front matter через `--front-matter-delimiter`; таблицы, tasklist, сноски, math, wikilinks, alerts — расширения встроены; очень быстрый | Рендер на бэкенде = лишний IPC-раунд на каждый предпросмотр; сложнее делать инкрементальный/частичный рендер | **Альтернатива** (отличен для массового оффлайн-рендера: экспорт, индексация plain-text) |
| pulldown-cmark | pull-парсер на Rust | **0.13.4**, 2026-05-20 | MIT | 2.7k | Активный | **`Parser::into_offset_iter()`** → байтовые диапазоны для каждого события | Очень быстрый, нулевые аллокации, используется в rustdoc | GFM-расширения неполные относительно comrak; рендерер минималистичный | **Альтернатива** |
| markdown-rs (`markdown` crate) | CommonMark на Rust | **1.0.0**, 2025-04-23 | MIT | 1.6k | **Замедленный** (последний коммит апрель 2025) | mdast с позициями (порт remark на Rust) | Даёт тот же mdast, что и remark — можно шарить логику | Автор переключился на другие проекты | **Отклонено** |

### Сравнение по ключевым осям

| Ось | markdown-it 15 | remark 11 | comrak 0.54 | pulldown-cmark 0.13 | marked 18 |
|---|---|---|---|---|---|
| CommonMark | 100% | 100% (micromark) | 652/652 | ~100% | ~высокая, но с вольностями |
| GFM | через плагины | `remark-gfm` | 670/670 встроенно | частично | частично |
| Позиции | `token.map` (строки) | `node.position` (строка+колонка+offset) | `sourcepos` в HTML | байтовые диапазоны | нет |
| Скорость (порядок) | быстрый | медленнее всех JS | самый быстрый | самый быстрый | самый быстрый в JS |
| Расширяемость | rules + плагины, максимум | плагины unified, максимум | флаги расширений, ограниченная | ручная, низкоуровневая | средняя |
| Годится для sync-scroll | **лучше всех** | да | да | да | нет |

### Набор плагинов markdown-it

Ключевой нюанс: значительная часть классических `markdown-it-*` плагинов не обновлялась с 2018–2023 и рискует сломаться на v15. Живая альтернатива — семейство **`@mdit/plugin-*`** (из экосистемы VuePress Theme Hope): **все проверенные пакеты выпущены 2026-08-12**, MIT, единый стиль API и TypeScript-типы.

| Задача | Классический плагин | Дата | Живая альтернатива | Дата | Вердикт |
|---|---|---|---|---|---|
| Сноски | `markdown-it-footnote` 4.0.0 | 2023-12-06 | **`@mdit/plugin-footnote` 1.1.0** | 2026-08-12 | брать `@mdit/*` |
| Task lists | `markdown-it-task-lists` 2.1.1 | **2018-03-06** | **`@mdit/plugin-tasklist` 1.1.0** | 2026-08-12 | брать `@mdit/*` |
| KaTeX | `markdown-it-katex` (мертвее всех) / `markdown-it-texmath` 1.0.0 (2022) / `@vscode/markdown-it-katex` 1.1.2 (2025-07-07) | — | **`@mdit/plugin-katex` 1.1.0** | 2026-08-12 | брать `@mdit/*`; `@vscode/markdown-it-katex` — достойная альтернатива |
| Attrs (`{.class #id}`) | `markdown-it-attrs` 5.0.1 | 2026-07-27 | `@mdit/plugin-attrs` 1.3.0 | 2026-08-12 | любой; оба живые |
| Контейнеры / admonitions | `markdown-it-container` 4.0.0 | 2023-12-05 | **`@mdit/plugin-container` 2.0.0** | 2026-08-12 | брать `@mdit/*` |
| GitHub-alerts (`> [!NOTE]`) | — | — | **`@mdit/plugin-alert` 2.0.0** или `markdown-it-github-alerts` 1.0.1 (2026-01-16) | 2026-08-12 | `@mdit/plugin-alert` |
| Mark (`==text==`) | `markdown-it-mark` 4.0.0 | 2023-12-05 | `@mdit/plugin-mark` 2.1.0 | 2026-08-12 | `@mdit/*` |
| Sub / Sup | `markdown-it-sub` 2.0.0 / `-sup` 2.0.0 | 2023-12-05 | `@mdit/plugin-sub` 1.1.0 / `-sup` 1.1.0 | 2026-08-12 | `@mdit/*` |
| Deflist | `markdown-it-deflist` **4.0.0** | 2026-07-27 | `@mdit/plugin-dl` 1.1.0 | 2026-08-12 | **Обязательно 4.0.0 и не ниже.** Релиз 4.0.0 специально переписан («Move definition nesting tracking from `StateBlock` to `env`») из-за удаления `StateBlock#ddIndent` в markdown-it 15 (issue [#1139](https://github.com/markdown-it/markdown-it/issues/1139)). **Версии ≤3.0.1 на v15 ломаются.** |
| Abbr | `markdown-it-abbr` 2.0.0 | 2023-12-06 | `@mdit/plugin-abbr` 1.1.0 | 2026-08-12 | `@mdit/*` |
| Implicit figures | `markdown-it-implicit-figures` 0.12.0 | 2023-08-19 | `@mdit/plugin-figure` 1.2.0 | 2026-08-12 | `@mdit/*` |
| Размер картинки `![](a.png =300x)` | — | — | `@mdit/plugin-img-size` 1.1.0 | 2026-08-12 | `@mdit/*` (важно для Obsidian-совместимости) |
| Emoji | `markdown-it-emoji` 3.1.0 | 2026-07-22 | — | — | живой, брать его |
| Anchor (id у заголовков) | `markdown-it-anchor` 10.0.0 | **2026-09-05** | — | — | живой (релиз буквально сегодня), брать |
| TOC | `markdown-it-toc-done-right` 4.2.0 | **2020-11-19** | — | — | **Отклонено**; TOC собирать самому из потока токенов (10 строк, см. раздел N) |
| MultiMD tables | `markdown-it-multimd-table` 4.2.3 | 2023-08-12 | — | — | **Альтернатива**; нужно только если требуются rowspan/colspan |
| Front matter | `markdown-it-front-matter` 0.2.4 | 2024-04-04 | `@mdit-vue/plugin-frontmatter` 3.0.2 (2025-08-11) | — | лучше не плагином, а отдельным слоем (см. I) |
| Wikilinks | `markdown-it-wikilinks` 1.4.0 (2023-08-12), `markdown-it-obsidian` 1.1.0 (**2021**) | — | — | — | **Отклонено** — писать свой inline-rule (~40 строк): нужна своя логика разрешения путей в vault |
| Номера строк для sync-scroll | `markdown-it-inject-linenumbers` 0.3.0 | 2023-03-17 | — | — | **Альтернатива**; либо 15 строк своего кода поверх `token.map` |
| Mermaid | `markdown-it-mermaid` 0.2.5 (**2017**) | — | — | — | **Отклонено** — свой рендерер fence-блоков с ленивой загрузкой (см. F) |
| Подсветка кода | `markdown-it-highlightjs` 4.3.0 (2026-02-06) | — | **`@shikijs/markdown-it` 4.4.3** (2026-08-10) | — | Shiki (см. E) |

### Итоговый выбор — D

**markdown-it 15.0.1** — рендерер для режима Read (быстрый, `token.map` для sync-scroll, огромная экосистема).
**remark/unified** — параллельный конвейер **только для анализа AST**: outline, backlinks, теги, wikilinks, переименование с обновлением ссылок. Рендером remark не занимается.
**comrak 0.54** (Rust) — опционально, для оффлайн-задач: экстракт plain-text при индексации в Tantivy и HTML-рендер при экспорте.

```
npm i markdown-it@15.0.1 \
  @mdit/plugin-footnote@1.1.0 @mdit/plugin-tasklist@1.1.0 @mdit/plugin-katex@1.1.0 \
  @mdit/plugin-container@2.0.0 @mdit/plugin-alert@2.0.0 @mdit/plugin-attrs@1.3.0 \
  @mdit/plugin-mark@2.1.0 @mdit/plugin-sub@1.1.0 @mdit/plugin-sup@1.1.0 \
  @mdit/plugin-dl@1.1.0 @mdit/plugin-abbr@1.1.0 @mdit/plugin-figure@1.2.0 \
  @mdit/plugin-img-size@1.1.0 \
  markdown-it-emoji@3.1.0 markdown-it-anchor@10.0.0 markdown-it-deflist@4.0.0

npm i unified@11.0.5 remark-parse@11.0.0 remark-gfm@4.0.1 remark-frontmatter@5.0.0 \
      remark-stringify@11.0.0 mdast-util-from-markdown@2.0.3 mdast-util-to-markdown@2.1.2 \
      mdast-util-gfm@3.1.0 unist-util-visit@5.1.0
```

Cargo (опционально): `comrak = "0.54"`.

**Внимание:** `@types/markdown-it` ставить НЕ нужно — с v15 типы встроены в пакет.

**markdown-it 15 НЕ является ESM-only** (частое заблуждение): `exports` в package.json содержит и `import` (ESM `.mjs`), и `require` (CJS `.cjs.js`) — CJS полностью работает. Проверка совместимости плагинов по `peerDependencies` (данные npm registry):

| Плагин | latest | peerDeps | Риск на v15 |
|---|---|---|---|
| `markdown-it-attrs` 5.0.1 | 2026-07-27 | `>= 9.0.0` | нет |
| `markdown-it-anchor` 10.0.0 | 2026-09-05 | `"*"` | нет |
| `markdown-it-deflist` 4.0.0 | 2026-07-27 | — | нет (**≤3.0.1 — ломается**) |
| `markdown-it-footnote` 4.0.0 | 2023-12-06 | нет peerDeps, devDeps `^13.0.2` | низкий, но не проверялся автором под v15 → предпочесть `@mdit/plugin-footnote` |
| `markdown-it-container` 4.0.0 | 2023-12-05 | нет peerDeps | низкий (плагин простой) |

---

## E. Подсветка кода

| Библиотека | Назначение | Версия / дата | Лицензия | Звёзды | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|---|
| **Shiki** | подсветка на TextMate-грамматиках | **4.4.3**, 2026-08-10 | MIT | 14k | Активный | Идентична VS Code — качество вне конкуренции; **выдаёт готовый HTML с инлайновыми цветами** → идеально для экспорта в HTML/PDF/DOCX и для копирования в Word; темы VS Code напрямую; `@shikijs/markdown-it` и `@shikijs/rehype` — официальные интеграции; двойные темы (light+dark одним проходом через CSS-переменные); транcформеры (диффы, focus, подсветка строк) | Full-бандл — 6.4 МБ minified / 1.2 МБ gzip; web-бандл — 3.8 МБ / 695 КБ gzip. **Обязательно fine-grained** | **Рекомендовано** |
| highlight.js | классическая подсветка | **11.12.0**, 2026-08-12 | BSD-3-Clause | 25k | Активный | Простой API, автодетект языка, легковесен при выборочной сборке | Регексп-грамматики → качество заметно хуже Shiki на сложных языках; цвета через CSS-классы (для экспорта нужно тянуть CSS) | **Альтернатива** (если размер бандла окажется критичным) |
| Prism | подсветка | **1.30.0**, 2025-03-10 | MIT | 13k | **Замедленный** (v2 в разработке годами, коммиты июнь 2026) | Очень маленький | Экосистема стагнирует, качество ниже Shiki | **Отклонено** |
| Lezer-based (`@lezer/highlight` + `@codemirror/language-data`) | переиспользовать грамматики CM6 и в preview | 1.2.3 / 6.5.2 | MIT | — | Активный | Ноль дополнительных грамматик: одна подсветка в Edit и в Read | Придётся писать «Lezer-tree → HTML» самому; языков меньше, чем в TextMate; в CM6 они уже загружены — экономия реальная, но код свой | **Альтернатива** (интересная оптимизация «фазы 2») |
| starry-night | VS Code-подобная подсветка на грамматиках GitHub | `@wooorm/starry-night` **3.11.0**, 2026-08-30 | MIT | — | Активный | Точно как на GitHub, hast-выход, хорошо ложится на remark/rehype | Тоже требует WASM (oniguruma), размер сопоставим с Shiki | **Альтернатива** |

### Как использовать Shiki правильно (fine-grained)

```ts
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'   // без WASM

const highlighter = await createHighlighterCore({
  themes: [
    import('@shikijs/themes/github-light'),
    import('@shikijs/themes/github-dark'),
  ],
  langs: [
    import('@shikijs/langs/markdown'), import('@shikijs/langs/javascript'),
    import('@shikijs/langs/typescript'), import('@shikijs/langs/python'),
    import('@shikijs/langs/rust'),       import('@shikijs/langs/json'),
    import('@shikijs/langs/bash'),       import('@shikijs/langs/html'),
    import('@shikijs/langs/css'),        import('@shikijs/langs/sql'),
    import('@shikijs/langs/yaml'),       import('@shikijs/langs/diff'),
  ],
  engine: createJavaScriptRegexEngine(),
})
```

Два ключевых решения:

1. **JavaScript RegExp engine вместо Oniguruma-WASM** — убирает ~1 МБ wasm-файла из бандла. Он покрывает подавляющее большинство грамматик; на редких языках может деградировать (у движка есть режим `forgiving`).
2. **Ленивая догрузка языков** — если в открытом документе встретился незнакомый fence, догружать грамматику по требованию через динамический импорт.

Тема в стиле «минимализм, один акцент»: строится своей `HighlightStyle` (CM6) и своей Shiki-темой в JSON, где почти всё — оттенки основного текста, а акцентом выделяются только строки/ключевые слова. Готовый минималистичный референс — **Flexoki** (kepano/flexoki, 3.6k звёзд, v2.0.0), у которого есть варианты для VS Code (значит, и для Shiki) и light/dark из одной палитры.

### Итоговый выбор — E

```
npm i shiki@4.4.3 @shikijs/markdown-it@4.4.3 @shikijs/transformers@4.4.3
```

(`@shikijs/langs` и `@shikijs/themes` приезжают транзитивно с `shiki`.)

---

## F. Математика и диаграммы

### Математика

| Библиотека | Версия / дата | Лицензия | Звёзды | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|
| **KaTeX** | **0.18.5**, 2026-08-31 | MIT | 20k | Активный (коммиты вчера) | Синхронный рендер без layout-reflow, самый быстрый; отличная типографика; поддержка `mhchem` (химия) отдельным расширением; в комплекте CSS + шрифты; официальная интеграция `@mdit/plugin-katex` и `rehype-katex` 7.0.1 | Покрытие LaTeX уже, чем у MathJax (нет `\newcommand` произвольной сложности, нет некоторых пакетов); нужно тащить шрифты KaTeX (~250 КБ woff2) | **Рекомендовано** |
| MathJax | `mathjax-full` **3.2.2**, 2022-06-08 — **пакет помечен DEPRECATED на npm**; v4 в статусе `4.0.0-beta.4` | Apache-2.0 | — | Замедленный | Максимальное покрытие LaTeX, MathML-выход, доступность | npm-пакет v3 deprecated, v4 годами в бете; в разы медленнее KaTeX; тяжелее | **Отклонено** |
| Temml | **0.13.5**, 2026-08-28 | MIT | 345 | Активный | Выдаёт **чистый MathML** — нулевой CSS-рантайм, идеален для копирования формул в Word (Word понимает MathML/OMML) и для PDF; пакет вдвое легче KaTeX (2.2 МБ против 4.0 МБ распакованных) | Малое сообщество (345 звёзд); нужны шрифты с поддержкой math (в Chromium/WebView2 MathML работает, но качество набора хуже KaTeX без правильных шрифтов) | **Альтернатива** — конкретно для экспорта в DOCX очень полезен |

**Решение:** KaTeX для экрана, Temml — опционально для DOCX-экспорта (MathML → OMML конвертируется, картинки формул не нужны).

### Диаграммы

| Библиотека | Версия / дата | Лицензия | Звёзды | Статус | Размер (распакованный npm) | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|---|
| **Mermaid** | **11.17.2**, 2026-08-25 | MIT | 90k | Активный | **84 МБ** пакет / 25 МБ JS — в бандле после tree-shaking ~500 КБ–1 МБ gzip | Де-факто стандарт: ```` ```mermaid ```` есть в GitHub, Obsidian, Notion; максимум типов диаграмм; активнейшая разработка | Огромный — **обязательна ленивая загрузка** (`await import('mermaid')` только когда в документе встретился mermaid-fence); использует динамическое построение стилей и может конфликтовать со строгой CSP (см. риск R-4) | **Рекомендовано (lazy)** |
| Graphviz via `@viz-js/viz` | **3.30.0**, 2026-09-01 | MIT | — | Активный | 5.0 МБ / 3.7 МБ JS (в основном wasm) | Настоящий Graphviz (dot) в wasm, детерминированная раскладка | Отдельный wasm ~2 МБ; нужен только тем, кто пишет dot | **Альтернатива (lazy, по требованию)** |
| Excalidraw | `@excalidraw/excalidraw` **0.18.1**, 2026-04-20 | MIT | 131k | Активный | очень тяжёлый | Отличный редактор скетчей | Это **целое приложение**, а не виджет: React-only, большой бандл, своя модель данных (`.excalidraw` JSON). Для минималистичного ридера — избыточно | **Отклонено** |
| D2 | `@terrastruct/d2` **0.1.33**, 2025-08-17 | MPL-2.0 | — | Замедленный (год без релиза) | — | Красивый современный язык диаграмм, есть wasm-сборка | Обёртка 0.1.x, год без обновлений; ниша | **Отклонено** |
| Pintora | `@pintora/standalone` **0.8.1**, 2025-12-03 | MIT | 1.3k | Замедленный | легче Mermaid | Легковесная альтернатива Mermaid с похожим синтаксисом | Малое сообщество, не совместим с mermaid-синтаксисом файлов пользователя | **Отклонено** |
| PlantUML | — | — | — | — | — | — | Требует Java или внешний сервер — **исключено по условию задачи** | **Отклонено** |

### Ленивая загрузка (шаблон)

```ts
// рендерер fence-блока в markdown-it
md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
  const t = tokens[idx]
  if (t.info.trim() === 'mermaid') {
    const id = `mmd-${idx}`
    queueMermaid(id, t.content)          // ставим в очередь
    return `<div class="mermaid-host" id="${id}"></div>`
  }
  return self.renderToken(tokens, idx, opts)
}

// один общий загрузчик на документ
let mermaidP: Promise<typeof import('mermaid')> | null = null
const loadMermaid = () => (mermaidP ??= import('mermaid'))
```

То же — для `@viz-js/viz` и для KaTeX (KaTeX можно грузить сразу: он мал и нужен часто).

### Итоговый выбор — F

```
npm i katex@0.18.5 mermaid@11.17.2
# опционально:
npm i temml@0.13.5 @viz-js/viz@3.30.0
```

---

## G. Поиск

Целевой сценарий: vault ~10 000 .md, «мгновенно» = <50 мс на запрос и <100 мс на открытие палитры.

| Библиотека | Назначение | Версия / дата | Лицензия | Звёзды | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|---|
| **Tantivy** (Rust) | полнотекстовый индекс | **0.26.1**, 2026-04-21 | MIT | 16k | Активный (коммиты вчера) | Lucene-класс на Rust: **~2× быстрее Lucene по латентности поиска**, индексация всей английской Wikipedia <3 мин, старт <10 мс, mmap-хранилище + сжатие LZ4/Zstd. **`tantivy::tokenizer::Language` — Snowball-стеммеры для 18 языков, включая русский.** Инкрементальные апдейты через `IndexWriter` (add/delete + commit). Индекс живёт на диске, а не в RAM | Каждый запрос — Tauri IPC-вызов (~1 мс, некритично); схему и токенизацию писать самому | **Рекомендовано** — для поиска по тексту |
| **uFuzzy** | fuzzy-фильтр строк | `@leeoniya/ufuzzy` **1.0.19**, 2025-08-22 | MIT | 3.0k | Замедленный, но зрелый | По бенчмарку автора на **162 000 фраз**: init 0.5 мс, 86 запросов за 434 мс — против Fuse.js 33 875 мс (**в 78 раз медленнее**), fuzzysort 1321 мс (в 3 раза), match-sorter 6245 мс. Корректно работает с кириллицей; выдаёт диапазоны совпадений для подсветки; ~5 КБ, без зависимостей | Не «fzf-ранжирование» из коробки — `info()`/`sort()` настраивать руками | **Рекомендовано** — для quick switcher (имена файлов + команды) |
| MiniSearch | полнотекст в JS | **7.2.0**, 2025-09-16 | MIT | 6.1k | Замедленный | **Проверено практикой: именно MiniSearch (с BM25) используется в Obsidian-плагине [Omnisearch](https://github.com/scambier/obsidian-omnisearch)** — прямой ответ на вопрос «что выбирают Obsidian-подобные приложения». Инкрементальные add/remove, сериализация toJSON/loadJSON | **Стемминга и стоп-слов нет вообще** (заявлено в документации) — для русского нужен свой `processTerm` + внешний Snowball-стеммер; персистентности на диск из коробки нет; индекс целиком в памяти | **Альтернатива** (fallback, если решим не тащить Rust-поиск) |
| FlexSearch | полнотекст в JS | **0.8.212**, 2025-09-06 | Apache-2.0 | 14k | Активный | По собственному бенчмарку — 50.9M ops/sec против 11 527 у Lunr, память 16 МБ против сотен МБ (цифры от автора, не независимые). В v0.8 появились персистентные индексы (IndexedDB/SQLite/Redis/Postgres) и `update()`/`remove()` | Документация путаная; кириллица поддержана как charset, но **настоящего русского стемминга нет** — только пресеты EN/DE/FR | **Альтернатива** |
| Orama | полнотекст + вектора | `@orama/orama` **3.1.18**, 2025-12-19 | Apache-2.0 | 11k | Замедленный | Красивый API; **`@orama/stemmers` 3.1.18 содержит `ru` — Snowball-стеммер для русского подтверждён** (проверено по содержимому пакета); гибрид с векторным поиском | Всё в памяти; персистентность отдельным плагином; проект сместился в облачный продукт | **Альтернатива** — как источник русского стеммера для MiniSearch |
| Fuse.js | fuzzy | **7.5.0**, 2026-07-13 | Apache-2.0 | 20k | Активный | Самый известный, простой API | В бенчмарке uFuzzy — **в 78 раз медленнее**; для интерактивного Ctrl+K на 10k+ даёт заметный лаг | **Отклонено** для 10k |
| Lunr (+ lunr-languages) | полнотекст | `lunr` **2.3.9** (**2020-08-19**); `lunr-languages` **1.21.0** (2026-08-09, MPL-1.1) — есть `lunr.ru.js` | MIT | — | **Ядро заброшено** | Русский стеммер есть в lunr-languages | Ядро 6 лет без релизов; **индекс иммутабельный — нет инкрементального обновления**, только полный ребилд | **Отклонено** |
| fuzzysort | fzf-подобный | **4.0.2**, 2026-08-13 | MIT | 4.3k | Активный | Заявляет <1 мс на 13 000 строк, score-based ранжирование | В бенчмарке uFuzzy втрое медленнее; оптимизирован под ASCII-идентификаторы | **Альтернатива** |
| command-score | скоринг команд | **0.1.2**, **2016-06-10** | MIT | — | **Заброшен** (10 лет) | Используется внутри `cmdk` | Отдельно брать смысла нет | **Отклонено** (приезжает транзитивно с cmdk) |
| fzf-for-js | порт алгоритма fzf | `fzf` **0.5.2**, 2023-04-25 | BSD-3-Clause | 954 | Замедленный | Честный порт основного алгоритма FZF в браузер | 3 года без публикаций | **Отклонено** |
| nucleo (Rust) | fzf-подобный матчер | `nucleo` **0.5.0**, 2024-04-02 | MPL-2.0 | — | Замедленный | Матчер из Helix: **~6× быстрее skim** (2.30 мс против 17.44 мс на исходниках ядра Linux), two-matrix Smith-Waterman (точнее одноматричного fzf), **корректная работа с Unicode-графемами — важно для кириллицы** | Два года без релиза; добавляет IPC-раунд там, где JS справляется | **Альтернатива** (если matching уедет в Rust) |

### Архитектура поиска

Три независимых механизма — не пытаться свести всё к одному:

1. **Quick switcher (Ctrl+K), вкладка «файлы» и «команды»** — целиком на фронте: список `{path, title, aliases}` (10k строк ≈ 1 МБ) держится в памяти, фильтруется **uFuzzy**. Никакого IPC, отклик <5 мс.
2. **Поиск по содержимому** — **Tantivy** в Rust. Схема: `path` (STRING, stored), `title` (TEXT, stored, boost), `body` (TEXT), `tags` (facet/STRING), `mtime` (i64 fast field). Токенизация: `SimpleTokenizer + LowerCaser + Stemmer(Russian)` для русского поля и `Stemmer(English)` — либо одно поле с двумя анализаторами, либо два поля и `BooleanQuery`. Индекс лежит в `AppData/<app>/index`, обновляется инкрементально по событиям watcher'а.
3. **Действия/команды** — статический реестр команд, тот же uFuzzy.

Fallback без Rust: **MiniSearch 7.2.0** (проверен на масштабе Obsidian через плагин Omnisearch), индексируя не полный текст, а `title + headings + tags + первые N символов`. Обязательно подключить свой `processTerm` с русским Snowball-стеммером — например, переиспользовав `ru`-модуль из `@orama/stemmers`, поскольку **в MiniSearch стемминга нет вообще**.

### Итоговый выбор — G

```
npm i @leeoniya/ufuzzy@1.0.19
```

```toml
tantivy = "0.26"
```

Fallback (если решим без Rust): `minisearch@7.2.0`.

---

## H. Файловая система и наблюдение

| Библиотека | Назначение | Версия / дата | Лицензия | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|
| **notify** (Rust) | FS watcher | **8.2.0**, 2025-08-03 (9.0.0-rc.5 в RC) | CC0-1.0 | Активный | Нативный `ReadDirectoryChangesW` на Windows; рекурсивный watch; минимальный оверхед на 10k файлов | Сырые события шумные. **Известные баги на Windows:** delete иногда репортится как update ([#206](https://github.com/notify-rs/notify/issues/206)); нет событий из подпапок-симлинков при рекурсивном watch ([#629](https://github.com/notify-rs/notify/issues/629)) | **Рекомендовано** |
| **notify-debouncer-full** | дебаунс + схлопывание событий | **0.7.0**, 2026-01-23 | MIT OR Apache-2.0 | Активный | Склеивает Rename From/To в одно событие, гасит спурьезные create+modify; **на Windows/macOS отслеживает file system ID**, чтобы сшивать переименования через перемещения. В примере доков окно дебаунса — 2 с | — | **Рекомендовано** |
| chokidar | FS watcher (Node) | **5.0.0**, 2025-11-25 | MIT | Активный | Есть `awaitWriteFinish` и опция `atomic` **специально под temp+rename паттерн редакторов** — полезно как описание проблемы, даже если сам пакет не берём | В Tauri Node нет — неприменимо | **Отклонено** (нерелевантно для Tauri) |
| @parcel/watcher | FS watcher (native Node addon) | **2.6.0**, 2026-07-20 | MIT | Активный | Тоже поверх `ReadDirectoryChangesW`; заявленный масштаб — «десятки тысяч файлов»; **rename там описан как пара delete+create**, а не единое событие | Нативный аддон для Node; в Tauri не нужен | **Отклонено** |
| **tempfile** | атомарная запись через temp+rename | **3.27.0**, 2026-03-11 | MIT OR Apache-2.0 | Активный | `NamedTempFile::persist()` = `ReplaceFileW`/rename, атомарно в пределах тома | Temp-файл нужно создавать **в той же директории**, иначе rename не атомарен | **Рекомендовано** |
| atomicwrites (Rust) | то же, готовая обёртка | **0.4.4**, 2024-09-19 | MIT | Замедленный | Проще API, сама кладёт temp рядом | Год без релиза; `tempfile` + 10 строк надёжнее | **Альтернатива** |
| write-file-atomic (npm) | то же для Node | **8.0.0**, 2026-05-08 | ISC | Активный | Эталонная реализация (используется npm) | Node-only | **Отклонено** (нерелевантно) |
| **trash** (Rust) | удаление в корзину | **5.2.7**, 2026-09-03 | MIT | Активный | Настоящая Корзина Windows через `IFileOperation` (с возможностью восстановления) | — | **Рекомендовано** |
| trash (npm) | то же для Node | **10.1.1**, 2026-02-25 | MIT | Активный | — | Node-only | **Отклонено** |
| **encoding_rs** | декод/энкод кодировок | **0.8.35**, 2024-10-24 | (Apache-2.0 OR MIT) AND BSD-3-Clause | Стабильный (движок кодировок Firefox) | Полный набор legacy-кодировок, включая windows-1251 и koi8-r | — | **Рекомендовано** |
| **chardetng** | автоопределение кодировки | **1.0.0**, 2026-03-30 | Apache-2.0 OR MIT | Активный (свежий 1.0!) | Детектор из Firefox, заметно точнее старых портов chardet на кириллице | Только для legacy-кодировок; UTF-8 проверяется отдельно | **Рекомендовано** |
| jschardet | детект кодировки (JS) | **3.1.4**, 2024-09-30 | LGPL-2.1+ | Замедленный | Порт chardet Mozilla | Медленный, LGPL, и не нужен если детект в Rust | **Отклонено** |
| chardet (npm) | детект (JS) | **2.2.0**, 2026-06-20 | MIT | Активный | Живой | Точность ниже chardetng | **Отклонено** |
| iconv-lite | конверсия (JS) | **0.7.3**, 2026-07-03 | MIT | Активный | — | Node-ориентирован; `TextDecoder` в WebView2 покрывает нужное | **Отклонено** |
| **ignore** | обход дерева с учётом .gitignore | **0.4.33**, 2026-08-04 | Unlicense OR MIT | Активный | Параллельный обход (движок ripgrep), уважает `.gitignore`/`.ignore` — точно то, что нужно для vault | — | **Рекомендовано** |
| walkdir | простой обход | **2.5.0**, 2024-03-01 | Unlicense/MIT | Стабильный | Проще | Без параллелизма и ignore-правил | **Альтернатива** |
| globset | глоб-паттерны | **0.4.20**, 2026-08-04 | Unlicense OR MIT | Активный | Быстрые пользовательские фильтры исключений | — | **Рекомендовано** |
| grep-searcher | построчный поиск (движок ripgrep) | **0.1.17**, 2026-07-15 | Unlicense OR MIT | Активный | Мгновенный «поиск без индекса» по vault (grep-режим) | Дублирует Tantivy | **Альтернатива** |

### Практические правила

- **Внешние изменения.** На каждое событие watcher'а: если файл открыт и «чистый» — перечитать молча; если «грязный» — показать неблокирующий баннер «файл изменён на диске: [Перезагрузить] [Оставить моё] [Сравнить]». Собственные записи фильтровать по «списку ожидаемых путей» с TTL ~1.5 с, иначе получится эхо. Дебаунс 500 мс–1 с, во фронтенд эмитить только уже свёрнутые события.
- **Атомарная запись.** `NamedTempFile::new_in(parent_dir)` → запись → `flush` + `sync_all` → `persist(path)`. Два критичных момента: (1) temp-файл **обязан лежать в той же директории**, иначе rename пойдёт между томами и превратится в copy+delete, потеряв атомарность; (2) на Windows предпочтителен `ReplaceFileW` — она для того и создана, чтобы сохранять ACL, атрибуты и alternate data streams оригинала, в отличие от простого `MoveFileEx`.
- **Retry.** OneDrive и антивирусы кратковременно держат файл заблокированным сразу после создания. Добавить 3–5 повторов с экспоненциальной паузой. *(Конкретная ссылка-первоисточник по OneDrive не найдена — это практическое наблюдение экосистемы Windows, а не подтверждённый документом факт.)*
- **Line endings.** Читать оба, при сохранении писать **тот же вид, что был в файле** (запомнить при открытии); для новых файлов — LF (совместимо с git и Obsidian).
- **BOM.** Если BOM был — сохранять; новые файлы писать без BOM.
- **Кодировка.** Сначала пробовать строгий UTF-8; при ошибке — `chardetng` → `encoding_rs`; при сохранении конвертировать обратно в исходную кодировку либо предложить «сохранить как UTF-8».

### Итоговый выбор — H

```toml
notify = "8.2"
notify-debouncer-full = "0.7"
tempfile = "3.27"
trash = "5.2"
encoding_rs = "0.8"
chardetng = "1.0"
ignore = "0.4"
globset = "0.4"
walkdir = "2.5"
```

---

## I. Front matter и метаданные

| Библиотека | Назначение | Версия / дата | Лицензия | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|
| **yaml** (eemeli) | YAML-парсер/сериализатор | **2.9.0**, 2026-05-11 | ISC | Активный | **Сохраняет комментарии, порядок ключей, стиль кавычек и отступы** при round-trip (Document API + `parseDocument`); полная спецификация YAML 1.2; TypeScript-типы | Тяжелее js-yaml; API документа надо изучить | **Рекомендовано** |
| js-yaml | YAML-парсер | **5.4.1**, 2026-08-26 | MIT | Активный | Быстрый, компактный, самый распространённый | Round-trip **разрушающий**: комментарии и порядок теряются — недопустимо для front matter, который правит пользователь | **Альтернатива** (только на read-only путях) |
| gray-matter | разбор front matter | **4.0.3**, **2021-04-24** | MIT | **Замедленный/заброшен** | Удобный API, поддержка YAML/TOML/JSON, кэш | 5 лет без релизов; внутри старый js-yaml; ставит `data` как обычный объект → комментарии теряются при записи | **Альтернатива** (быстрый старт), но не для записи |
| smol-toml | TOML | **1.8.0**, 2026-08-11 | BSD-3-Clause | Активный | Современный, быстрый, TOML 1.0 | Нужен только если пользователи используют `+++`-фронтматтер (Hugo) | **Альтернатива** |
| `toml` (Rust) | TOML на бэкенде | **1.1.5**, 2026-09-02 | MIT OR Apache-2.0 | Активный | — | — | **Альтернатива** |
| serde_yaml (Rust) | YAML на бэкенде | **0.9.34+deprecated**, 2024-03-25 | MIT OR Apache-2.0 | **Deprecated самим автором** | — | Явно помечен как deprecated | **Отклонено** |
| serde_yml (Rust) | форк serde_yaml | **0.0.13**, 2026-05-27 | MIT OR Apache-2.0 | Активный, но версия 0.0.x | Живой форк | Версия 0.0.x, качество форка спорное | **Отклонено** — front matter парсить на фронте |

### Реализация

Отдельный тонкий слой (~50 строк), а не плагин парсера:

```ts
// splitFrontMatter(raw) -> { fm: string | null, body: string, bodyOffsetLine: number }
// парсинг:   parseDocument(fm)      из 'yaml'  -> сохраняет комментарии
// запись:    doc.set('tags', [...]); String(doc)  -> минимальный дифф
```

`bodyOffsetLine` критичен: без него `token.map` из markdown-it будет смещён относительно реальных строк файла, и sync-scroll «уедет» ровно на высоту front matter.

Поддержать оба разделителя: `---` (YAML) и `+++` (TOML) — второй лишь для чтения.

### Итоговый выбор — I

```
npm i yaml@2.9.0
# опционально для TOML-фронтматтера:
npm i smol-toml@1.8.0
```

---

## J. Экспорт и импорт

### Экспорт

| Цель | Инструмент | Версия / дата | Лицензия | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|
| **PDF (без диалога)** | **`ICoreWebView2_7::PrintToPdf`** через `with_webview` + крейт `webview2-com` **0.39.1** (2026-03-11) | — | MIT | Активный | Крейт **уже экспортирует** `PrintToPdfCompletedHandler` / `PrintToPdfStreamCompletedHandler`. Печатает **ровно тот DOM, что отрендерен в webview** — KaTeX и Mermaid выходят один в один как на экране, без второго движка рендеринга. Настройки: orientation, margins, scale, `ShouldPrintBackgrounds`, базовые `ShouldPrintHeaderAndFooter` / `HeaderTitle` / `FooterUri` | Windows-only unsafe-COM код; готового Tauri-примера в официальных доках нет — писать самому (~60–80 строк); колонтитулы — упрощённый шаблон Chromium, без богатой кастомизации | **Рекомендовано** (основной путь для «Экспорт → PDF») |
| PDF (с диалогом) | `window.print()` в скрытом окне с print-CSS | — | — | — | Ноль зависимостей; системный диалог умеет «Microsoft Print to PDF». Работает внутри Tauri/WebView2 (подтверждается историей PR/issues проекта) | Диалог, а не тихий экспорт; известный баг печати iframe — [tauri#13451](https://github.com/tauri-apps/tauri/issues/13451) (open) | **Альтернатива** (кнопка «Печать») |
| PDF | headless Chrome (puppeteer / chromiumoxide) | — | — | — | Более гибкие шаблоны колонтитулов через `Page.printToPDF` | Требует системный Chrome или загрузку Chromium — **дублирование того же движка, который уже есть в WebView2**, ценой десятков-сотен МБ | **Отклонено** |
| PDF | WeasyPrint | — | BSD | Активный | Хороший CSS Paged Media | Требует Python 3.10+ и Pango/cairo — несовместимо с «без внешних зависимостей» | **Отклонено** |
| PDF | Typst (crate `typst` **0.15.1**, 2026-07-17, Apache-2.0, 56k звёзд) | — | Apache-2.0 | Очень активный | Великолепная типографика, встраивается как Rust-библиотека, свой движок формул | **Конвертера HTML→Typst или Markdown→Typst «из коробки» не существует** — transpiler писать с нуля; Mermaid-диаграммы всё равно придётся растрировать | **Отклонено** сейчас (интересно для «книжного» экспорта в будущем) |
| PDF, колонтитулы/пагинация | paged.js (`pagedjs` **0.4.3**, **2023-07-06**) | — | MIT | **Замедленный** (коммиты март 2026, релиз 2023) | Полифилл CSS Paged Media: running headers/footers, счётчики страниц, «Оглавление … 12» — именно то, чего нет в обычной печати Chromium | 3 года без публикаций, **202 открытых issue**, конфликтует с некоторыми print-CSS | **Альтернатива** (подключать только если реально нужны колонтитулы) |
| **HTML standalone** | свой инлайнер | — | — | — | Один HTML-файл: CSS инлайном, картинки в `data:`-URI, KaTeX-шрифты base64, Shiki уже даёт инлайновые цвета | Пишется самому (~150 строк) | **Рекомендовано** |
| **DOCX** | `docx` (dolanmiu) **9.7.1**, 2026-05-27 | MIT | 5.9k | Активный | Программная сборка DOCX из mdast: заголовки, списки, таблицы, картинки, стили — полный контроль | Маппинг mdast→docx писать самому (~400 строк); формулы — только как картинки (или через Temml→MathML→OMML) | **Рекомендовано** |
| DOCX | `html-to-docx` **1.8.0**, **2023-03-26** | MIT | — | **Заброшен** | Быстрый путь HTML→DOCX | 3.5 года без обновлений, слабые таблицы | **Отклонено** |
| DOCX | **`mdast2docx` / `md-to-docx` 1.6.1**, 2025-10-31 | MPL-2.0 | — | Активный | **Конвертирует MDAST (remark AST) напрямую в DOCX, минуя HTML** — а MDAST у нас уже есть из раздела D. Поддерживает footnotes, images, links. Это может снять большую часть работы по маппингу | Небольшое сообщество; MPL-2.0; формул нет | **Рекомендовано попробовать первым** — если покрытие устроит, экономит ~400 строк |
| DOCX/что угодно | pandoc как внешний бинарник | — | **GPL-2.0+** | Активный | Эталонное качество; **LaTeX→OMML у pandoc заметно лучше всего, что есть в чистом JS** — единственный реальный путь получить в Word настоящие редактируемые формулы | Внешняя зависимость; вызов неизменённого бинарника юридически безопасен, но **при бандлинге в инсталлятор нужно соблюдать условия GPL**; собственная документация предупреждает, что сложные таблицы «могут не влезть в простую модель документа pandoc»; точный размер Windows-бинарника — *не проверено* | **Альтернатива** — «если pandoc найден в PATH, показать расширенные форматы экспорта» |
| **Изображение** | `html-to-image` **1.11.13**, 2025-02-14 | MIT | — | Замедленный | Прост, SVG-foreignObject подход | Проблемы с внешними шрифтами и CORS; год без релиза | **Альтернатива** |
| Изображение | `dom-to-image-more` **3.10.2**, 2026-07-10 | MIT | — | Активный | Активный форк, починены шрифты и тени | Тот же foreignObject-подход со своими ограничениями | **Рекомендовано** |
| **Rich text в буфер** | **Tauri-команда на Rust: ручная запись CF_HTML + CF_UNICODETEXT через WinAPI** (`arboard` **3.6.1** / `clipboard-win` **5.4.1** как основа) | 3.6.1 / 5.4.1 | MIT+Apache / BSL-1.0 | Активный | Единственный надёжный путь на Windows — см. ниже | `clipboard-win` не имеет встроенного CF_HTML: формат надо регистрировать вручную (`RegisterClipboardFormat("HTML Format")`) и писать CF_HTML-обёрнутый фрагмент в той же сессии `OpenClipboard`/`EmptyClipboard`, что и CF_UNICODETEXT (~80 строк) | **Рекомендовано** |
| Rich text в буфер | веб-API `navigator.clipboard.write([new ClipboardItem({'text/html':…, 'text/plain':…})])` | — | — | — | Стандартный путь, Baseline с июня 2024 | **БЛОКЕР в WebView2:** при записи нескольких MIME-типов **сохраняется только последний** — [WebView2Feedback#4801](https://github.com/MicrosoftEdge/WebView2Feedback/issues/4801), закрыт как «not planned», в обычном Edge не воспроизводится. Это ровно ломает паттерн html+plain. Плюс скопированное из WebView2 не попадает в историю буфера Win+V ([#5649](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5649)) | **Отклонено** для Windows |

### Импорт

| Источник | Инструмент | Версия / дата | Лицензия | Статус | Вердикт |
|---|---|---|---|---|---|
| HTML → MD | **turndown** **7.2.4**, 2026-04-03 | MIT | 11k | Активный (коммиты на прошлой неделе) | **Рекомендовано** |
| HTML → MD, GFM-таблицы и strikethrough | **`@joplin/turndown-plugin-gfm` 1.0.67**, 2026-05-08 | MIT | — | Активный (форк Joplin) | **Рекомендовано** — оригинальный `turndown-plugin-gfm` 1.0.2 стоит с **2018** |
| DOCX → HTML/MD | **mammoth** **1.12.2**, 2026-08-28 | BSD-2-Clause | 6.3k | Активный | **Рекомендовано** — умеет и «docx → simple HTML», и напрямую markdown |
| Evernote `.enex` | **yarle** (akosbalasko/yarle) | MIT | — | Активный (1050+ коммитов) | **Рекомендовано** — готовый ENEX→Markdown конвертер с профилями под Obsidian/Logseq, метаданными (теги, GPS, таймстемпы) и шаблонами. Node/TS, можно встроить или гонять как разовый CLI |
| Evernote `.enex` | `enex-dump` 1.4.1 (**2019**) | MIT | — | Заброшен | **Отклонено** |

### Итоговый выбор — J

```
npm i turndown@7.2.4 @joplin/turndown-plugin-gfm@1.0.67 mammoth@1.12.2 \
      docx@9.7.1 mdast2docx@1.6.1 dom-to-image-more@3.10.2
```

```toml
webview2-com = "0.39"    # PrintToPdf
arboard = "3.6"          # rich-text буфер обмена (см. R-16)
```

PDF — через `ICoreWebView2_7::PrintToPdf`; `window.print()` оставить как кнопку «Печать».
Rich-text в буфер — **только через Rust** (баг WebView2 #4801, см. риск R-16).

---

## K. Проверка орфографии

| Вариант | Версия / дата | Лицензия | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|
| **Нативный spellcheck WebView2** (атрибут `spellcheck` на contenteditable) | часть Windows/Edge | — | — | Ноль зависимостей и ноль веса; красное подчёркивание наследуется от Chromium/Edge; кастомизация контекстного меню со spellcheck-suggestions существует ([WebView2Feedback PR#5553](https://github.com/MicrosoftEdge/WebView2Feedback/pull/5553), merged) | **Публичного API управления спелчекером нет** — в `CoreWebView2Settings` отсутствует `IsSpellCheckEnabled` или аналог. **Ключевое ограничение: спелчекер игнорирует HTML-атрибут `lang` и использует только язык окружения** ([#5294](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5294), open) — то есть русский словарь появится, только если русский добавлен как язык Windows/ввода, а не потому что вы поставили `lang="ru"`. Плюс известный баг «spellcheck пропадает из контекстного меню» ([#2993](https://github.com/MicrosoftEdge/WebView2Feedback/issues/2993), open) | **Рекомендовано как база, но с оговорками** |
| **nspell + dictionary-ru / dictionary-en** | `nspell` **2.1.5** (**2021-01-17**), `dictionary-ru` **3.0.0** (2023-11-03), `dictionary-en` **4.0.0** (2023-11-03) | MIT / BSD-3-Clause | Замедленный (nspell — 5 лет), но рабочий (используется в экосистеме retext/unified) | Чистый JS, офлайн, Hunspell-совместимые словари. Словари — это просто данные `.dic`/`.aff` из wooorm/dictionaries, «устаревание» для них некритично. Позволяет добавлять слова пользователя и словарь vault | nspell без обновлений с 2021; русская морфология даёт большой аффикс-файл — проверку гнать в Web Worker; только орфография, не грамматика | **Рекомендовано как дополнение** — и, по итогам исследования, **единственный реально пригодный для русского офлайн-вариант** |
| **Spellbook** (Rust) | **0.4.2**, 2026-06-03 | MPL-2.0 | Активный (helix-editor, 144 звезды) | Современный Hunspell-совместимый чекер на Rust; быстрый; вызывается из Tauri-команды, не грузит фронтенд | Молодой, малое сообщество; MPL-2.0 | **Альтернатива** — лучшая замена nspell, если проверка уедет в Rust |
| zspell (Rust) | **0.5.5**, 2024-06-13 | нестандартная | Замедленный | Аналог | 2 года без релиза, нестандартная лицензия | **Отклонено** |
| hunspell-asm / nodehun | **4.0.2**, **2020-02-01** | MIT | **Заброшен** | Настоящий Hunspell в wasm; формат Hunspell стабилен, так что технически может работать и сейчас | 6 лет без публикаций | **Отклонено** |
| **Harper** | `harper.js` **2.7.0** (2026-07-28), crate `harper-core` **2.8.0** (2026-08-13) | Apache-2.0 | Очень активный (Automattic, 15k звёзд, коммиты сегодня) | Не просто орфография — **грамматика и стиль**, локально, wasm- и Rust-API, <1/50 памяти LanguageTool | **Подтверждено официально: только английский** — «Harper currently only supports English, but the core is extensible to support other languages». Для русского **не применим** | **Альтернатива** — только для англоязычных заметок |
| LanguageTool локально | — | LGPL | Активный | Лучшее качество, поддерживает русский | Java 8+; **собственная документация прямо говорит, что embedded HTTP server «will not work» для упакованного Windows-десктоп-приложения**; полноценное качество требует n-gram данных — **~8 ГБ на диске** и рекомендованный SSD | **Отклонено** (максимум — опциональная интеграция с уже установленным локально сервером) |

### Итоговый выбор — K

Трёхуровневая схема:

1. **База:** `spellcheck="true"` на редактируемой области (Rich и Edit) → системная проверка WebView2. **Важно объяснить это пользователю в интерфейсе:** русский словарь заработает, только если русский добавлен как язык в настройках Windows — атрибут `lang="ru"` на элементе WebView2 игнорирует ([#5294](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5294)). Значит, нужна проверка при старте и подсказка «добавьте русский язык в Windows, чтобы включить проверку орфографии».
2. **Дополнение (и фактически основной путь для русского):** `nspell` + `dictionary-ru`/`dictionary-en` в Web Worker — (а) слова из самого vault (термины, имена собственные, `#теги`), (б) пользовательский словарь, (в) независимость от языковых настроек ОС. Диагностика подаётся в CodeMirror через `@codemirror/lint`.
3. **Опция:** Harper — **только для англоязычных заметок** (грамматика/стиль), включается в настройках.
4. **Чего не будет:** офлайн-проверки *грамматики* русского. Лёгкого решения на 2026 год не существует: Harper — английский, LanguageTool — Java + гигабайты n-gram и явное предупреждение авторов не встраивать его в десктоп-приложение.

```
npm i nspell@2.1.5 dictionary-ru@3.0.0 dictionary-en@4.0.0
# опционально:
npm i harper.js@2.7.0
```

---

## L. Изображения

| Задача | Инструмент | Версия / дата | Лицензия | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|
| Вставка из буфера (основной путь) | обычный `paste`-обработчик в webview: `ClipboardEvent.clipboardData.files` / `items` с `image/png` | — | — | — | Стандартный веб-путь; WebView2 — полноценный Chromium, движок это поддерживает | Не даёт доступа к буферу вне фокуса окна. Прямого подтверждения работы именно в Tauri/WebView2 найти не удалось — *проверить экспериментом* | **Рекомендовано** (пробовать первым) |
| Вставка из буфера (запасной) | `tauri-plugin-clipboard-manager` **2.3.3**, 2026-08-31 (`read_image`/`write_image`, разрешения `clipboard-manager:allow-read-image`) | MIT OR Apache-2.0 | Активный | Официальный плагин; Windows/Linux/macOS (на мобильных — только текст) | **Есть открытые баги ровно на нашей связке:** [plugins-workspace#3563](https://github.com/tauri-apps/plugins-workspace/issues/3563) — «Unable to readImage()», ошибка «clipboard contents were not available in the requested format», воспроизведено на **Tauri 2.11.5 + clipboard-manager 2.3.3**; [#1901](https://github.com/tauri-apps/plugins-workspace/issues/1901) — `write_image` теряет альфа-канал PNG (прозрачный фон чернеет), закрыт как «not planned». В работе PR [#3532](https://github.com/tauri-apps/plugins-workspace/pull/3532) и [#3436](https://github.com/tauri-apps/plugins-workspace/pull/3436) («add readImagePNG») | **Альтернатива с оговорками** |
| `tauri-plugin-clipboard` (CrossCopy) | **2.1.11**, **2024-10-17** | MIT | Замедленный (2 года) | Поддерживает Tauri v2; даёт `readImageBase64` / `writeImageBase64` / `readImageBinary`, а также HTML/RTF/файлы — то, чего официальный плагин изначально не умел | 2 года без релиза | **Альтернатива** — реальный обход багов официального плагина |
| Drag-n-drop файлов | штатное событие Tauri `tauri://drag-drop` (даёт пути на диске) | — | — | — | Пути на диске напрямую → можно копировать в assets без чтения в память | **Архитектурное ограничение без обходного пути** ([tauri#15138](https://github.com/tauri-apps/tauri/issues/15138), closed as not planned): при `dragDropEnabled: true` нативный OS-listener блокирует HTML5 `dragover`/`preventDefault()` — курсор показывает «Forbidden» даже над валидной drop-зоной; при `false` теряется доступ к `dataTransfer` для внешних файлов. Гибридного режима нет | **Рекомендовано** (`dragDropEnabled: true` + собственная визуальная индикация drop-зоны вместо стандартного курсора) |
| Сжатие/ресайз | crate **`image` 0.25.10**, 2026-03-10 | MIT OR Apache-2.0 | Активный | Всё на бэкенде: decode/resize/encode (PNG/JPEG/WebP), без блокировки UI | — | **Рекомендовано** |
| Сжатие (JS) | `browser-image-compression` **2.0.2**, **2023-03-06** | MIT | Замедленный | Простой API, работает в воркере | 3 года без релиза; в Tauri Rust-путь лучше | **Отклонено** |
| sharp | — | Apache-2.0 | — | — | — | Node-нативный аддон, в Tauri неприменим | **Отклонено** |
| Размер картинки без декода | crate `imagesize` **0.15.0**, 2026-07-09 | MIT | Активный | Читает размеры из заголовка — мгновенно, для резервирования места в вёрстке (нет «прыжков» при загрузке) | — | **Рекомендовано** |
| Lightbox / просмотр | `medium-zoom` **1.1.0**, **2023-11-16** | MIT | Замедленный | ~3 КБ, ровно один эффект — плавный зум по клику; идеально для минимализма | 3 года без релиза (но фича закончена) | **Рекомендовано** |
| Lightbox | `photoswipe` **5.4.4**, 2024-05-24 | MIT | Замедленный | Полноценная галерея, жесты, зум | Тяжелее и «богаче», чем нужно минималистичному ридеру | **Альтернатива** |
| Подписи к картинкам | `@mdit/plugin-figure` 1.2.0 (2026-08-12) | MIT | Активный | `![подпись](img.png)` → `<figure><img><figcaption>` | — | **Рекомендовано** |

### Правила работы с assets

- Папка ассетов: `<vault>/assets/` (настраиваемо), имя файла — `<slug-заметки>-<YYYYMMDD-HHmmss>.<ext>`.
- Для показа локальных картинок в webview нужен **`asset:`-протокол Tauri**: включить `app.security.assetProtocol.enable = true` и добавить scope на папку vault (см. риск R-6).
- Переименование картинки → обновление ссылок делается тем же механизмом, что и переименование заметки (раздел N).

### Итоговый выбор — L

```
npm i medium-zoom@1.1.0 @mdit/plugin-figure@1.2.0
```

```toml
image = "0.25"
imagesize = "0.15"
tauri-plugin-clipboard-manager = "2.3"
```

---

## M. UI-инфраструктура (фронтенд)

### Фреймворк

| Кандидат | Версия / дата | Лицензия | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|
| **React** | **19.2.8**, 2026-07-21 | MIT | Активный | **Решающий аргумент: вся нужная готовая инфраструктура — React-only**: `cmdk`, `@radix-ui/*`, `react-resizable-panels`, `@tanstack/react-virtual`, `@floating-ui/react`, `@dnd-kit/*`. Именно это и есть «не переписывать заново то, что уже есть» | Больше рантайма (~45 КБ gzip), больше церемоний; редакторы (CM6, Milkdown) всё равно императивные и живут вне React-дерева | **Рекомендовано** |
| Svelte 5 | **5.57.0**, 2026-08-28 | MIT | Активный | Runes, минимальный рантайм, компилятор — самый быстрый и лёгкий результат; отлично дружит с императивными редакторами (`use:action`) | Command palette, resizable panes, virtual list, context menu — писать самому или брать менее зрелые порты | **Альтернатива** (лучший выбор, если готовы написать ~5 компонентов сами) |
| SolidJS | **1.9.15**, 2026-08-17 | MIT | Активный | Самый быстрый реактивный рантайм, JSX как в React | Экосистема готовых компонентов заметно меньше | **Отклонено** |
| Vue | **3.5.42**, 2026-08-27 | MIT | Активный | Отличный DX, большая экосистема | В нише «сложный desktop-редактор» готовых компонентов меньше, чем в React | **Отклонено** |

### Компоненты и утилиты

| Задача | Библиотека | Версия / дата | Лицензия | Звёзды | Статус | Плюсы | Минусы | Вердикт |
|---|---|---|---|---|---|---|---|---|
| Сборка | **Vite** **8.2.2**, 2026-08-20 | MIT | — | Активный | Штатный тулинг для Tauri, мгновенный HMR | — | **Рекомендовано** |
| Язык | **TypeScript** **7.0.2**, 2026-07-08 | Apache-2.0 | — | Активный | v7 — нативная (Go) реализация компилятора: проверка типов в разы быстрее | Свежий мажор; при проблемах откатиться на 6.x | **Рекомендовано** |
| Состояние | **zustand** **5.0.15**, 2026-08-13 | MIT | — | Активный | Минимальный API, работает вне React (селекторы можно дёргать из CM6-плагинов), без провайдеров, отличный DevTools/persist | — | **Рекомендовано** |
| Состояние | jotai **2.20.3**, 2026-08-24 | MIT | — | Активный | Атомарная модель | Для «vault + настройки + UI-состояние» атомы избыточны | **Альтернатива** |
| Состояние | nanostores **1.5.3**, 2026-09-02 | MIT | — | Активный | Крошечный, фреймворко-независимый | Меньше готовых рецептов | **Альтернатива** |
| Виртуализация | **@tanstack/react-virtual** **3.14.10**, 2026-08-18 | MIT | 7.1k | Активный | Обязателен для дерева файлов на 10k элементов и для длинных списков поиска; поддержка динамических высот | — | **Рекомендовано** |
| Command palette | **cmdk** **1.1.1**, 2025-03-14 | MIT | 13k | Замедленный (последний коммит октябрь 2025) | Идеальная база для Ctrl+K: unstyled, доступность, группы, встроенный скоринг (`command-score`); можно подменить фильтр на uFuzzy | Год без релиза — риск невысок (компонент завершён), но стоит зафиксировать версию | **Рекомендовано** |
| Command palette | kbar **1.0.0**, 2026-08-10 | MIT | 5.2k | Активный (дошёл до 1.0) | Более «готовый» из коробки: вложенные действия, история | Больше своего UI-мнения — сложнее сделать «как в макетах» | **Альтернатива** |
| Хоткеи | **tinykeys** **4.0.0**, 2026-05-20 | MIT | 4.1k | Активный | ~400 байт, поддержка аккордов (`g g`, `Ctrl+K Ctrl+S`), без React-зависимости | Нет реестра команд — писать свой (он всё равно нужен для палитры) | **Рекомендовано** |
| Хоткеи | hotkeys-js **4.0.7**, 2026-08-28 | MIT | — | Активный | Богаче, области видимости | Больше и «глобальнее» | **Альтернатива** |
| Хоткеи | react-hotkeys-hook **5.3.3**, 2026-06-26 | MIT | — | Активный | Удобные хуки | Привязка к React-дереву мешает, когда фокус в CodeMirror | **Альтернатива** |
| Разделители панелей | **react-resizable-panels** **4.12.3**, 2026-08-16 | MIT | 5.4k | Активный | Unstyled, сохраняет layout, клавиатурная доступность, вложенные группы | — | **Рекомендовано** |
| Разделители панелей | allotment **1.20.5**, 2025-12-19 | MIT | — | Замедленный | Ощущается как VS Code | 9 месяцев без релиза, свои стили | **Альтернатива** |
| Контекстное меню | **@radix-ui/react-context-menu** **2.3.7**, 2026-07-24 | MIT | — | Активный | Unstyled, полная доступность и клавиатура, единый вид с остальным UI, работает одинаково на всех платформах | Не выглядит «нативно по-виндовому» | **Рекомендовано** |
| Контекстное меню | нативное меню Tauri 2 (`Menu`/`ContextMenu` API) | — | MIT/Apache | Активный | Настоящее системное меню Win11 | Нельзя стилизовать под минималистичную тему, поведение различается по платформам, сложнее динамика | **Альтернатива** |
| Popover/tooltip | **@floating-ui/react** **0.27.20**, 2026-07-11 | MIT | 33k | Активный | Позиционирование любой сложности, unstyled — под bubble-меню и hover-превью ссылок то, что нужно | Низкоуровневый (это и плюс) | **Рекомендовано** |
| Drag-n-drop дерева | **@atlaskit/pragmatic-drag-and-drop** **3.1.0**, 2026-08-29 | Apache-2.0 | — | Активный | Работает поверх нативного HTML5 DnD → мало кода в DOM, отличная производительность на больших деревьях; есть готовые рецепты для tree | API более «низкоуровневый», чем dnd-kit | **Рекомендовано** |
| Drag-n-drop | @dnd-kit/core **6.3.1**, **2024-12-05** | MIT | 18k | Замедленный (v7 в разработке) | Прекрасный API | Релиз почти двухлетней давности; на нативные файлы из ОС всё равно не работает | **Альтернатива** |
| Шрифт | **@fontsource/ibm-plex-mono** **5.3.0**, 2026-07-19 | OFL-1.1 | — | Активный | Самохостинг (важно: в Tauri внешние Google Fonts недоступны при строгой CSP и офлайн); latin + **cyrillic** сабсеты отдельными файлами | **Вариативной версии не существует** — `@fontsource-variable/ibm-plex-mono` отсутствует в npm (проверено: 404), в отличие от `@fontsource-variable/ibm-plex-sans` 5.3.0. Значит, подключаем статические начертания | **Рекомендовано** |
| Иконки | **lucide-react** **1.41.0**, 2026-09-04 | ISC | 24k | Очень активный | Тонкие штриховые иконки — ровно минималистичная эстетика; tree-shaking по одной иконке; 1.x стабилизирован | — | **Рекомендовано** (10–15 иконок, не больше) |
| Тема | CSS custom properties | — | — | — | `:root` + `[data-theme="dark"]`, плюс `@media (prefers-color-scheme)`; ноль зависимостей; мгновенное переключение | — | **Рекомендовано** |

### Про шрифт

`@fontsource/ibm-plex-mono` 5.3.0, OFL-1.1, весь пакет 1.5 МБ распакованным (это все веса × все сабсеты × woff2+woff). В бандл берём точечно:

```
@fontsource/ibm-plex-mono/cyrillic-400.css
@fontsource/ibm-plex-mono/cyrillic-500.css
@fontsource/ibm-plex-mono/cyrillic-400-italic.css
@fontsource/ibm-plex-mono/latin-400.css
@fontsource/ibm-plex-mono/latin-500.css
@fontsource/ibm-plex-mono/latin-400-italic.css
```

Итого ~6 woff2-файлов, десятки КБ. Вариативной версии IBM Plex Mono нет, так что 400/500 + italic — разумный минимум. `font-display: block` для редактора (чтобы не было скачка метрик моноширинного текста).

### Итоговый выбор — M

```
npm i react@19.2.8 react-dom@19.2.8 \
      zustand@5.0.15 @tanstack/react-virtual@3.14.10 \
      cmdk@1.1.1 tinykeys@4.0.0 react-resizable-panels@4.12.3 \
      @radix-ui/react-context-menu@2.3.7 @floating-ui/react@0.27.20 \
      @atlaskit/pragmatic-drag-and-drop@3.1.0 \
      @fontsource/ibm-plex-mono@5.3.0 lucide-react@1.41.0

npm i -D vite@8.2.2 typescript@7.0.2 @vitejs/plugin-react
```

---

## N. Прочее

| Задача | Решение | Версия / дата | Лицензия | Статус | Комментарий | Вердикт |
|---|---|---|---|---|---|---|
| **Outline / TOC** | обход потока токенов markdown-it: `token.type === 'heading_open'` + `token.map[0]` + `token.tag` | — | — | — | 20 строк своего кода. `markdown-it-toc-done-right` 4.2.0 стоит с **2020** — не брать. Для outline в Edit-режиме — обход Lezer-дерева (`syntaxTree(state).iterate`) по узлам `ATXHeading1..6` | **Своё** |
| Anchor-id заголовков | `markdown-it-anchor` **10.0.0**, **2026-09-05** | Unlicense | Активный | Свежайший релиз; нужен для якорных ссылок и «прыжка» из outline | **Рекомендовано** |
| **Word count / reading time** | нативный `Intl.Segmenter` (`granularity: 'word'`) | — | — | — | В WebView2 (Chromium) доступен. Корректно считает **кириллицу, CJK и эмодзи** — в отличие от `reading-time` **1.5.0** (2021, англоцентричные эвристики) и `words-count` **2.0.2** (2021). Скорость чтения: 180 слов/мин для кириллицы, 250 — латиницы, 500 знаков/мин — для CJK | **Своё на Intl.Segmenter** |
| Word count | `reading-time` 1.5.0 | 2021-09-10 | MIT | Заброшен | Только английский | **Отклонено** |
| **Sync-scroll source↔preview** | `token.map` из markdown-it → `data-line` + **алгоритм VS Code (копируется почти 1:1)** | — | MIT | Активный | Готовый эталон — два файла VS Code: [`preview-src/scroll-sync.ts`](https://github.com/microsoft/vscode/blob/main/extensions/markdown-language-features/preview-src/scroll-sync.ts) и [`src/preview/scrolling.ts`](https://github.com/microsoft/vscode/blob/main/extensions/markdown-language-features/src/preview/scrolling.ts). Алгоритм: элементы preview получают `data-line` из `token.map`; preview→editor — **бинарный поиск** по видимым элементам с `data-line`, затем интерполяция дробной позиции внутри элемента; editor→preview — обратный путь через `scrollToRevealSourceLine`; **многострочные code-fence обрабатываются отдельно**: `progressInCodeBlock = (line - previous.line) / (previous.endLine - previous.line)`; дробная часть строки транслируется в offset символа (`Math.floor(fraction * text.length)`). Не забыть прибавить `bodyOffsetLine` от front matter (см. I) | **Своё (~120 строк) по эталону VS Code** |
| **Typewriter / focus mode** | своё расширение CM6 | — | — | — | Typewriter: `EditorView.updateListener` → `view.dispatch({effects: EditorView.scrollIntoView(pos, {y:'center'})})`. Focus mode: `Decoration.line` с классом `dim` на все строки, кроме текущего абзаца. Обе — по ~40 строк. Готовых пакетов под CM6 нет | **Своё** |
| **Форматирование таблиц** | `markdown-table` **3.0.4**, 2024-10-22 | MIT | Замедленный (фича завершена) | Крошечный, точно выравнивает столбцы с учётом `align`. Нужен свой парсер строк GFM-таблицы → массив ячеек, затем `markdownTable(rows, {align})` | **Рекомендовано** |
| Форматирование таблиц (готовое) | `markdown-table-formatter` **1.7.0**, 2025-12-27 | MIT | Активный | Прямое попадание в задачу — «Format markdown tables in files», свежий и поддерживаемый | **Альтернатива** — попробовать перед тем, как писать своё |
| Форматирование markdown целиком | `prettier` **3.9.6**, 2026-07-21 | MIT | Активный | **Подтверждено на уровне исходников:** в Prettier есть выделенный `src/language-markdown/print/table.js`, который считает `columnMaxWidths` через `getStringWidth` (**с учётом двойной ширины CJK-символов**) и выравнивает GFM-таблицы. То есть Prettier реально форматирует таблицы «из коробки». ~3 МБ — грузить лениво как команду «Format document» | **Альтернатива (lazy)** |
| Интерактивный редактор таблиц | `@susisu/mte-kernel` **2.1.1**, **2020-11-28** | MIT | **Заброшен** (5+ лет) | Ядро Atom-плагина markdown-table-editor; требует реализовать интерфейс `ITextEditor`. **Не является частью Obsidian** (у Obsidian своя закрытая реализация). Архитектурно к копированию пригоден | **Отклонено** как зависимость, годится как референс |
| **Link preview / hover** | `@floating-ui/react` + свой рендер первых N строк целевого файла | — | — | — | Готовой библиотеки нет; вся механика — позиционирование (Floating UI) + чтение файла | **Своё** |
| **Wikilink разрешение** | свой inline-rule markdown-it + индекс `basename → path[]` | — | — | — | `markdown-it-wikilinks` 1.4.0 (2023) и `markdown-it-obsidian` 1.1.0 (**2021**) не решают главного — разрешения имён внутри vault с учётом дубликатов, алиасов из front matter и подпапок. ~40 строк своего кода + Map | **Своё** |
| **Rename с обновлением ссылок** | своя реализация на mdast + **готовый код Foam для копирования** | — | MIT | Активный | **Изолированного npm-пакета «переименуй файл и поправь ссылки» не существует** — везде эта логика вшита в приложение. Самый чистый и маленький кусок для выдёргивания — **Foam** (17k звёзд, README прямо заявляет «Sync links on file rename»): файлы `packages/foam-vscode/src/vscode/features/editing/update-wikilinks.ts`, `refactor.ts`, рядом `block-rename-provider.ts`, `heading-rename-provider.ts`, `convert-links.ts` (все со `.spec.ts`). Другие референсы: **Dendron** `packages/plugin-core/src/commands/RenameNoteV2a.ts` (важная деталь их архитектуры — **пауза file-watcher на время операции**, чтобы не ловить дубли событий), **Logseq** `handler/page.cljs` → `outliner-op/rename-page!`.<br>Алгоритм: (1) индекс backlinks строится при обходе vault; (2) при переименовании берём файлы-источники; (3) парсим remark→mdast, обходим `link` и свои `wikiLink`-узлы через `unist-util-visit`; (4) **не** сериализуем через `remark-stringify` (он нормализует форматирование!), а делаем **точечную замену по `node.position.start.offset`/`end.offset`** — дифф минимален | **Своё (позиционные замены) по коду Foam** |
| **Backlinks** | тот же индекс | — | — | — | `Map<path, Set<path>>`, строится при обходе vault, обновляется по событиям watcher'а. Хранить рядом с индексом Tantivy | **Своё** |
| **Diff / история** | `diff` (jsdiff) **9.0.0**, 2026-04-13 | BSD-3-Clause | Активный | `diffWords`/`diffLines`, есть патчи. Замена устаревшему `diff-match-patch` **1.0.5** (**2020-05-20**, Google, фактически заброшен) | **Рекомендовано** |
| Diff на бэкенде | crate `similar` **3.2.0**, 2026-08-17 | Apache-2.0 | Активный | Быстрее для больших файлов, есть Myers/Patience/LCS и «inline»-подсветка | **Альтернатива** |
| История версий | свои снапшоты в `<vault>/.mdreader/history/` | — | — | — | Простейшее и самое предсказуемое: снапшот при закрытии/каждые N минут, хранить N последних + дедупликация по хэшу | **Рекомендовано** |
| История версий | `git2` (libgit2) **0.21.0**, 2026-05-18 | MIT OR Apache-2.0 | Активный (112M+ загрузок) | Настоящий git без спавна внешнего `git.exe` и без второй JS-реализации. «Тихий коммит при сохранении» реализуется естественно. Требует линковки libgit2 | **Рекомендовано**, если нужна git-история (предпочтительнее isomorphic-git) |
| История версий | `isomorphic-git` **1.41.9**, 2026-08-23 | MIT | Активный | Чистый JS, без нативных зависимостей | В Tauri вся работа с ФС идёт через IPC — на больших репозиториях медленно; функционально беднее libgit2 | **Отклонено** в пользу git2 |
| **Автообновление** | `tauri-plugin-updater` **2.11.0**, 2026-08-31 | MIT/Apache | Активный | Подписанные обновления (minisign-ключ), JSON-манифест, NSIS/MSI | **Рекомендовано** |
| **Single instance** | `tauri-plugin-single-instance` **2.4.4**, 2026-08-31 | MIT/Apache | Активный | Обязателен: без него двойной клик по .md откроет второе окно приложения. Колбэк получает `argv` второго запуска — оттуда и берётся путь файла | **Рекомендовано** |
| **Deep link** | `tauri-plugin-deep-link` **2.4.10**, 2026-08-31 | MIT/Apache | Активный | Для `mdreader://open?path=...` — пригодится для интеграций и для обратных ссылок | **Рекомендовано** |
| **File association** | `bundle.fileAssociations` в `tauri.conf.json` | — | — | — | `[{ "ext": ["md","markdown","mdx"], "name": "Markdown", "description": "Markdown Document", "role": "Editor" }]`. Работает вместе с single-instance | **Рекомендовано** |
| **Глобальные хоткеи** | `tauri-plugin-global-shortcut` **2.3.2**, 2026-05-28 | MIT/Apache | Активный | Для «быстрой заметки» из любого приложения | **Рекомендовано** |
| **Настройки** | `tauri-plugin-store` **2.4.4**, 2026-07-18 | MIT/Apache | Активный | JSON-хранилище с автосохранением, доступ и из JS, и из Rust | **Рекомендовано** |
| **Состояние окна** | `tauri-plugin-window-state` **2.4.1**, 2025-10-27 | MIT/Apache | Активный | Запоминает позицию/размер/maximized | **Рекомендовано** |
| **Логирование** | `tauri-plugin-log` **2.9.1**, 2026-08-31 | MIT/Apache | Активный | Единый лог из JS и Rust в файл + stdout; ротация | **Рекомендовано** |
| **Crash reporting** | `std::panic::set_hook` → запись в лог + флаг «прошлый запуск упал» | — | — | — | Sentry для некоммерческого офлайн-приложения избыточен и требует сети. `sentry-rust` — **Альтернатива**, если понадобится | **Своё** |
| **i18n** | `@inlang/paraglide-js` **2.25.0**, 2026-08-27 | MIT | Активный | Компилируется в обычные функции: ноль рантайма, tree-shaking по ключам, типобезопасность — идеально для 2 языков (ru/en) | **Рекомендовано** |
| i18n | `i18next` **26.4.2**, 2026-09-03 | MIT | Очень активный | Стандарт индустрии, плюрализация, интерполяция | Рантайм + загрузка ресурсов — тяжелее необходимого для двух языков | **Альтернатива** |
| **Тесты (unit)** | `vitest` **5.0.0**, 2026-09-03 | MIT | Активный | Общая конфигурация с Vite; для парсеров, wikilink-резолвера, форматтера таблиц — идеально | **Рекомендовано** |
| **Тесты (e2e, настоящее приложение)** | **`@playwright/test` 1.63.0** (2026-09-04) + подключение к WebView2 через CDP | Apache-2.0 | Очень активный | **Крупная находка: у Playwright есть официальная страница именно про WebView2** — https://playwright.dev/docs/webview2. Схема: поднять приложение с `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, затем `playwright.chromium.connectOverCDP('http://localhost:9222')`. Поскольку Tauri на Windows **и есть** WebView2, техника применима напрямую — можно тестировать настоящее собранное приложение обычным Playwright | Только Windows 10/11; для параллельных тестов надо вручную разносить user-data-dir и порты по воркерам (общая user-data-dir по умолчанию — источник конфликтов); Tauri-специфики в доке Playwright нет | **Рекомендовано** |
| Тесты (e2e webview, дёшево) | Playwright + мок-слой поверх Tauri IPC в обычном Chromium | Apache-2.0 | — | Самый быстрый и стабильный контур для UI-логики без сборки Rust | Не проверяет реальный бэкенд | **Рекомендовано** (основной объём тестов) |
| Тесты (e2e нативные, WebDriver) | **`tauri-driver` 2.0.6**, 2026-05-06 + Edge WebDriver | MIT/Apache | Активный | Официальный путь Tauri; сам синхронизирует Edge WebDriver под установленный WebView2. Официально рекомендуемая обёртка — **WebdriverIO** (`@wdio/tauri-service`) | **Только Windows и Linux** (на macOS драйвера для WKWebView нет вовсе); историческая хрупкость — открытый [tauri#3576](https://github.com/tauri-apps/tauri/issues/3576) «tauri-driver's native webdriver is not always synced with itself» | **Альтернатива** |

### Итоговый выбор — N

```
npm i markdown-table@3.0.4 diff@9.0.0 markdown-it-anchor@10.0.0
npm i -D vitest@5.0.0 @playwright/test@1.63.0
npm i @inlang/paraglide-js@2.25.0
npm i -D prettier@3.9.6      # только для команды "Format document", грузить лениво
```

```toml
similar = "3.2"   # опционально, diff на бэкенде
```

---

## Сводная таблица: рекомендованный стек

| Компонент | Выбор | Версия (2026-09-05) | Лицензия | Почему |
|---|---|---|---|---|
| Оболочка | **Tauri** | 2.11.5 | MIT/Apache-2.0 | 3–12 МБ вместо 90–150, Rust-бэкенд даёт Tantivy/notify/comrak/trash бесплатно |
| Фронтенд-фреймворк | **React** | 19.2.8 | MIT | вся готовая UI-инфраструктура (cmdk, Radix, panels, virtual) — React-only |
| Сборка / язык | **Vite / TypeScript** | 8.2.2 / 7.0.2 | MIT / Apache-2.0 | штатный тулинг Tauri; TS 7 — быстрый нативный компилятор |
| Режим Edit (raw) | **CodeMirror 6** | view 6.43.11, lang-markdown 6.5.2 | MIT | модульность, Lezer-markdown, декорации под будущий live-preview |
| Режим Rich (WYSIWYG) | **Milkdown Crepe** (альтернатива: Tiptap 3 + `@tiptap/markdown`) | 7.22.1 (3.31.3) | MIT | единственный, где bubble-toolbar + slash-меню + таблицы + LaTeX уже готовы |
| Rich, фаза 2 | **`@atomic-editor/editor`** — Obsidian-style live preview на CM6 | 0.6.2 | MIT | убирает round-trip как класс проблемы: одна модель на Edit и Rich |
| Режим Read (рендер) | **markdown-it** | 15.0.1 | MIT | `token.map` для sync-scroll, живейшая экосистема плагинов |
| Плагины markdown-it | **`@mdit/plugin-*`** | все 2026-08-12 | MIT | классические `markdown-it-*` частью стоят с 2018–2023 |
| Анализ AST | **remark / unified** | unified 11.0.5, remark-gfm 4.0.1 | MIT | mdast с `position` — для backlinks, outline, rename с обновлением ссылок |
| Подсветка кода | **Shiki** (fine-grained + JS-engine) | 4.4.3 | MIT | качество VS Code, инлайновые цвета → чистый экспорт в HTML/PDF/DOCX |
| Математика | **KaTeX** (+ Temml для DOCX) | 0.18.5 (0.13.5) | MIT | быстрый синхронный рендер; Temml даёт MathML для Word |
| Диаграммы | **Mermaid** (lazy) | 11.17.2 | MIT | стандарт де-факто; обязательна ленивая загрузка |
| Полнотекстовый поиск | **Tantivy** | 0.26.1 | MIT | индекс на диске, BM25, встроенный русский стеммер, 10k файлов — мгновенно |
| Quick switcher Ctrl+K | **uFuzzy** + **cmdk** | 1.0.19 + 1.1.1 | MIT | самый быстрый fuzzy на 10k строк + unstyled-палитра |
| FS watcher | **notify** + **notify-debouncer-full** | 8.2.0 + 0.7.0 | CC0 / MIT+Apache | нативный `ReadDirectoryChangesW`, схлопывание шумных событий |
| Атомарная запись / корзина | **tempfile** + **trash** | 3.27.0 + 5.2.7 | MIT+Apache / MIT | temp+rename в той же папке; настоящая Корзина Windows |
| Кодировки | **encoding_rs** + **chardetng** | 0.8.35 + 1.0.0 | MIT/Apache | движок и детектор из Firefox — лучшее качество на кириллице |
| Front matter | **yaml** (eemeli) | 2.9.0 | ISC | единственный, сохраняющий комментарии и порядок ключей при round-trip |
| Экспорт PDF | **`ICoreWebView2_7::PrintToPdf`** через `webview2-com` | 0.39.1 | MIT | тихий экспорт, рендер идентичен экрану (KaTeX, Mermaid) |
| Экспорт DOCX | **mdast2docx** (пробовать первым) → **docx** (dolanmiu) | 1.6.1 / 9.7.1 | MPL-2.0 / MIT | mdast→docx напрямую; docx — если нужен полный контроль |
| Rich text в буфер | **Rust: CF_HTML + CF_UNICODETEXT** (`arboard`) | 3.6.1 | MIT/Apache | веб-API `ClipboardItem` сломан в WebView2 (баг #4801, см. R-16) |
| Импорт HTML/DOCX | **turndown** + `@joplin/turndown-plugin-gfm` + **mammoth** | 7.2.4 / 1.0.67 / 1.12.2 | MIT / MIT / BSD-2 | все три активны; joplin-форк вместо мёртвого оригинала |
| Орфография | системный WebView2 + **nspell** (+Harper для EN) | — / 2.1.5 / 2.7.0 | — / MIT / Apache-2.0 | ноль веса как база; nspell — только для словаря vault |
| Изображения | Tauri clipboard + crate `image` + **medium-zoom** | 2.3.3 / 0.25.10 / 1.1.0 | MIT | сжатие на бэкенде, 3 КБ на лайтбокс |
| Состояние | **zustand** | 5.0.15 | MIT | работает и вне React — важно для CM6-плагинов |
| Виртуализация | **@tanstack/react-virtual** | 3.14.10 | MIT | дерево на 10k файлов |
| Панели / меню / поповеры | **react-resizable-panels** / **Radix ContextMenu** / **@floating-ui/react** | 4.12.3 / 2.3.7 / 0.27.20 | MIT | unstyled, доступность из коробки |
| Хоткеи | **tinykeys** | 4.0.0 | MIT | 400 байт, поддержка аккордов |
| DnD дерева | **pragmatic-drag-and-drop** | 3.1.0 | Apache-2.0 | производительность на больших деревьях |
| Шрифт / иконки | **@fontsource/ibm-plex-mono** / **lucide-react** | 5.3.0 / 1.41.0 | OFL-1.1 / ISC | самохостинг с кириллицей; тонкие штриховые иконки |
| Diff | **diff** (jsdiff) | 9.0.0 | BSD-3-Clause | замена заброшенному diff-match-patch |
| i18n | **paraglide-js** | 2.25.0 | MIT | компиляция в функции, ноль рантайма |
| Тесты | **Vitest** + **Playwright** (в т. ч. **официально по WebView2 через CDP**) | 5.0.0 / 1.63.0 | MIT / Apache-2.0 | unit по парсерам + e2e и мок-фронта, и настоящего приложения |

**Что придётся написать самому (осознанное решение, а не упущение):**

| Задача | Объём | Есть ли эталон для копирования |
|---|---|---|
| sync-scroll source↔preview | ~120 строк | **да** — `scroll-sync.ts` + `scrolling.ts` из VS Code |
| rename с обновлением ссылок | ~200 строк | **да** — `update-wikilinks.ts` / `refactor.ts` из Foam |
| форматтер таблиц поверх `markdown-table` | ~150 строк | частично — `markdown-table-formatter`, prettier `table.js` |
| CF_HTML в буфер обмена (Rust) | ~80 строк | нет (WinAPI по документации) |
| PrintToPdf через `with_webview` (Rust) | ~60–80 строк | частично — API-справка `webview2-com` |
| маппинг mdast→docx | ~400 строк, **или 0**, если подойдёт `mdast2docx` | да, `mdast2docx` |
| HTML-инлайнер для standalone-экспорта | ~150 строк | нет |
| индекс backlinks | ~100 строк | да — Foam / SilverBullet |
| wikilink-резолвер | ~40 строк | нет (специфика vault) |
| typewriter / focus mode | ~80 строк | нет |
| custom titlebar | ~120 строк, **или 0** с `tauri-plugin-decorum` | да |

Итого порядка **1000–1500 строк** — против нескольких десятков тысяч, которые дают готовые библиотеки.

---

## Риски и известные проблемы интеграции

### R-1. Milkdown Crepe: потери при round-trip markdown

**Суть.** Milkdown сериализует документ через remark → нормализация маркеров списков, отступов, экранирования. Подтверждённые конкретные проблемы (проверено 2026-09-05):

- [#1712](https://github.com/Milkdown/milkdown/issues/1712) «[Feature] Frontmatter/metadata support» — **open**. Front matter не поддерживается вовсе: «Milkdown doesn't know what to do with this at present».
- [#2349](https://github.com/Milkdown/milkdown/issues/2349) — **open**: обратные слэши в autolink-URL **удваиваются на каждом round-trip** → экспоненциальный рост.
- [#2008](https://github.com/Milkdown/milkdown/issues/2008) — **open** с июля 2025: сноски есть в базовом GFM-пресете Milkdown, но **отсутствуют именно в Crepe**.
- Закрытые, но показывающие класс проблем: #2403 (вложенные strong/emphasis не пересобираются при сериализации — форматирование может молча превратиться в литеральные звёздочки); #2428 (`remarkPreserveEmptyLinePlugin` молча удаляет авторские инлайновые `<br>` при загрузке — **потеря HTML**); #2419 (атрибут `spread` хранится строкой, ломая tight-списки).
- Wikilinks: релевантных issues не найдено — нативной поддержки, судя по всему, нет.

**Митигация.**
1. Источник истины — текст на диске. Rich-режим пишет обратно **только при реальном редактировании** в нём (dirty-флаг), не при простом переключении вкладок.
2. Front matter отрезается **до** передачи в Crepe и приклеивается обратно при сохранении (слой из раздела I).
3. Прогнать перед стартом разработки round-trip-тест: взять 30–50 реальных файлов, `parse → serialize` и сравнить. Если потери неприемлемы — переключаться на «фазу 2» (live-preview на CM6).
4. Опция настроек «Rich-режим только для чтения» для пользователей-пуристов.

### R-2. Tauri + Windows 11: frameless-окно и snap layouts

**Суть.** При `decorations: false` теряются **Snap Layouts** Win11 (сетка при наведении на кнопку «развернуть»). Это **подтверждённый и до сих пор не закрытый** баг: [tauri#4531](https://github.com/tauri-apps/tauri/issues/4531), открыт **2022-06-30**, статус **«upstream»** — зависит от tao/winit, то есть силами Tauri не чинится. Также при `decorations:false` + `shadow:true` на Windows появляется 1px белая рамка (зато скруглённые углы Win11 работают).

**Митигация — три готовых варианта, в порядке предпочтения.**

1. **`tauri-plugin-decorum` 1.1.1** (2024-09-22, MIT, 322 звезды) — **поддерживает Tauri v2** (в репозитории прямо: «This Tauri (v2) plugin») и **явно решает нашу проблему**: не отключает нативные декорации полностью, а прячет системный титлбар оверлеем, сохраняя Snap Layout, resize-border и тень. Метод `create_overlay_titlebar()`, разрешение `decorum:allow-show-snap-overlay`, требует `withGlobalTauri: true`. **Оговорка:** автор сам пишет, что проект «mostly in maintenance mode now — no breaking API changes, other than architecture improvements and bugfixes» — рабочий, но не развивается; релиз 2 года назад.
2. **`tauri-plugin-snap-layout` 1.0.9** (2026-06-14, MIT) — свежий нишевый плагин ровно под Snap Layout Windows 11, добавлен в awesome-tauri в июле 2026 ([PR#810](https://github.com/tauri-apps/awesome-tauri/pull/810)). Молодой (≈2k загрузок), но актуальный.
3. **Написать самому:** обработать `WM_NCHITTEST` и вернуть `HTMAXBUTTON` над зоной кнопки «развернуть» (~40 строк unsafe-Rust). Точный рецепт под Tauri 2.11 — *не проверено*.

Дополнительно: **`window-vibrancy` 0.8.0** (2026-07-16) для Mica/Acrylic — `apply_mica` только Win11, `apply_acrylic`/`apply_blur` Win10+; требует `transparent: true`. **Известная проблема производительности:** «Bad performance when resizing/dragging the window on Windows 11 build 22621+» для blur/acrylic — Mica безопаснее.

**Прагматичный компромисс:** оставить `decorations: true` и вписать минимализм в системный титлбар — ноль рисков и ноль кода.

### R-3. Tauri + WebView2 + вставка изображения из буфера

**Суть.** У официального плагина есть **открытые баги ровно на нашей связке версий**:

- [plugins-workspace#3563](https://github.com/tauri-apps/plugins-workspace/issues/3563) — **open**: «Unable to readImage() using clipboard-manager», ошибка «clipboard contents were not available in the requested format». Воспроизведено на **Tauri 2.11.5 + clipboard-manager 2.3.3** — то есть именно на тех версиях, которые мы выбрали.
- [#1901](https://github.com/tauri-apps/plugins-workspace/issues/1901) — на Windows 11 `write_image` с PNG **теряет альфа-канал**: прозрачный фон становится чёрным. Закрыт как «not planned».
- В работе PR [#3532](https://github.com/tauri-apps/plugins-workspace/pull/3532) и [#3436](https://github.com/tauri-apps/plugins-workspace/pull/3436) («add readImagePNG») — проблему признают и чинят.

**Митигация.** Трёхуровневая цепочка с фолбэками:
1. Веб-событие `paste` (`clipboardData.items` / `.files` с `image/png`) — WebView2 это полноценный Chromium, стандартный путь должен работать. *Проверить в первый же день.*
2. При неудаче — `tauri-plugin-clipboard-manager` `read_image`.
3. При неудаче — **`tauri-plugin-clipboard` от CrossCopy 2.1.11**, у которого есть `readImageBase64`/`readImageBinary` и который исторически покрывал форматы, недоступные официальному плагину.

Обязательно прогнать сценарии: копирование картинки из браузера, из Проводника, **скриншот «Win+Shift+S»**, копирование из Word, картинка с прозрачностью (проверка бага #1901).

### R-4. Mermaid в CSP Tauri

**Суть — риск оказался меньше, чем ожидалось.** Ключевой факт: **CSP в Tauri активна, только если явно задана** в `app.security.csp` — по умолчанию Tauri её не навязывает. То есть политику можно ослабить или не задавать вовсе.

Важная поправка к распространённому тезису: **утверждение «Mermaid требует `unsafe-eval`» подтвердить не удалось**. Официальная страница безопасности Mermaid описывает только санитизацию через DOMPurify (`dompurifyConfig`) и не упоминает eval/CSP. Относиться к этому как к **неподтверждённой гипотезе**, а не к факту.

**Митигация.**
- Задать CSP осознанно, начав с `"style-src": "'self' 'unsafe-inline'"` (инлайновые стили нужны Mermaid и KaTeX почти наверняка).
- Для WASM-фронтендов доки Tauri прямо требуют `'wasm-unsafe-eval'` в `script-src` — если возьмём Oniguruma-движок Shiki, это понадобится (ещё один аргумент за JavaScript RegExp engine, см. R-9).
- `'unsafe-eval'` для локального офлайн-приложения без загрузки внешнего контента приемлемо, но добавлять только по факту падения.
- Ленивая загрузка Mermaid изолирует проблему: если он не инициализировался, остальной документ рендерится нормально.
- Крайний фолбэк — рендер диаграмм на бэкенде через `@mermaid-js/mermaid-cli` 11.17.0, но он тащит headless-браузер и противоречит идее лёгкого приложения.

### R-5. Печать в PDF из Tauri

**Суть — риск снят, путь понятен.** Штатного кроссплатформенного API у Tauri нет (открытые [#4917](https://github.com/tauri-apps/tauri/issues/4917) и [#12284](https://github.com/tauri-apps/tauri/issues/12284)), но:

- `window.print()` **работает** внутри WebView2 в Tauri и открывает системный диалог печати (подтверждается историей PR/issues проекта). Известный частный баг — печать iframe: [tauri#13451](https://github.com/tauri-apps/tauri/issues/13451), open.
- Нативный `ICoreWebView2_7::PrintToPdf` **доступен из Rust**: крейт `webview2-com` 0.39.1 экспортирует `PrintToPdfCompletedHandler` и `PrintToPdfStreamCompletedHandler`. Печатает ровно тот DOM, что уже отрендерен, — KaTeX и Mermaid выходят идентично экрану. Настройки: orientation, margins, scale, `ShouldPrintBackgrounds`, базовые header/footer.

**Остаточный риск:** готового Tauri-примера в официальных доках нет — интероп через `with_webview` придётся написать самому (~60–80 строк unsafe-COM), и он Windows-only.

**Митигация.**
1. В первый же день сделать спайк: `window.print()` + минимальный `PrintToPdf` через `webview2-com`. Это определяет всю стратегию экспорта.
2. Основной путь — `PrintToPdf` (тихий экспорт в файл). Кнопка «Печать» — `window.print()`.
3. Колонтитулы и «Оглавление … стр.» сверх возможностей Chromium: `pagedjs` 0.4.3 (замедленный, 202 открытых issue) либо принять ограничения print-CSS.

### R-6. Локальные изображения не отображаются (asset-протокол)

**Суть.** Ссылка `![](assets/pic.png)` в webview не разрешится: у страницы свой origin, а прямой доступ к `file://` в Tauri 2 запрещён.

**Митигация.** Включить `app.security.assetProtocol.enable = true`, добавить scope на папку vault и преобразовывать пути через `convertFileSrc()`. Поскольку vault выбирается пользователем в рантайме, обязателен **`tauri-plugin-persisted-scope` 2.3.8** — иначе разрешение на папку будет теряться при перезапуске.

### R-7. CodeMirror 6 и IME

**Суть — риск подтверждён и системный.** CM6 работает поверх `contenteditable`; при активной композиции IME нельзя менять DOM, иначе ввод срывается. Для live-preview (где `Decoration.replace` скрывает разметку) это прямой конфликт. Проблема **не разовая, а периодически всплывающая заново**:

- Закрытый #340 (2020) «Decorations cause input methods not working properly» — базовый случай (замена `---` на `<hr>` widget ломала IME).
- Закрытый #1134 (2023) — в Chrome/macOS добавление widget-декорации **во время** композиции даёт дублирование/смещение итогового символа.
- Закрытый #1654 (январь 2026) «IME composition problem in decoration» — китайский/японский ввод «forcibly taken as letters» при работе с декоратором; регрессия с 3.9.0.
- **Открытые сейчас:** #1727 (июль 2026) «Persistent scroll jump with a large block `Decoration.replace` widget» — напрямую про наш сценарий; #1708 (июнь 2026, тибетский IME); #1403 (открыт с 2024, корейский + Enter в Safari, мейнтейнер не смог воспроизвести).

Для Windows-специфичных багов открытых issue не найдено (есть только старый закрытый #652 «Windows IME confusion with text replacements») — то есть **для нашей основной платформы риск ниже, чем для macOS/Android**.

Напоминание: искать и заводить issues теперь на **https://code.haverbeke.berlin/codemirror/dev**, GitHub-репозиторий архивирован.

**Митигация.** Отслеживать `view.composing` и **не перестраивать декорации во время композиции** — откладывать пересчёт до её конца. Не применять `Decoration.replace` к строке, где стоит курсор (это и правильный UX: активная строка показывает сырой markdown). Крупные блочные `Decoration.replace` (таблицы, диаграммы) — с фиксированной высотой, чтобы не воспроизвести #1727.

### R-8. markdown-it 15 — свежий мажор

**Суть.** v15.0.0 вышел **2026-07-30**, v15.0.1 — 2026-08-27. Ломающие изменения (из [CHANGELOG](https://github.com/markdown-it/markdown-it/blob/master/CHANGELOG.md)): удалены subpath-экспорты `markdown-it/lib/*`; `validateLink`/`normalizeLink`/`normalizeLinkText` переехали со свойств на методы прототипа; `linkify-it` → v6 (fuzzy-links выключены по умолчанию, юникодная пунктуация терминирует ссылку); удалён `StateBlock#ddIndent` (старые версии `markdown-it-deflist` ломаются); корень пакета теперь резолвится в prebuilt ESM/CJS, а не в исходники.

**Митигация.** Использовать `@mdit/plugin-*` (релиз 2026-08-12, т. е. заведомо после v15) и `markdown-it-deflist` **4.0.0**. Каждый плагин из «старого» списка (`markdown-it-footnote` 4.0.0 от 2023, `markdown-it-task-lists` 2.1.1 от **2018**) проверить smoke-тестом. Аварийный путь — dist-tag `v14-legacy` = **14.3.1**.

### R-9. Размер бандла Shiki

**Суть.** Full-бандл — 6.4 МБ minified / 1.2 МБ gzip; web-бандл — 3.8 МБ / 695 КБ gzip (цифры из [документации Shiki](https://shiki.style/guide/bundles)). Наивный `import { codeToHtml } from 'shiki'` затащит всё.

**Митигация.** Только fine-grained: `createHighlighterCore` + точечные импорты `@shikijs/langs/*` и `@shikijs/themes/*` + `createJavaScriptRegexEngine()` вместо Oniguruma-WASM (экономит ~1 МБ). 12 языков + 2 темы — десятки КБ. Догрузка редких языков по требованию.

### R-10. Расхождение подсветки между Edit и Read

**Суть.** В Edit подсветка идёт через Lezer (CM6), в Read — через TextMate (Shiki). Грамматики разные → один и тот же фрагмент кода может выглядеть по-разному.

**Митигация.** Проектировать тему в терминах **семантических ролей** (keyword / string / comment / number / type / punctuation), а не конкретных токенов, и определить одинаковые CSS-переменные для обеих систем. Для минималистичной темы с одним акцентом расхождения почти незаметны — там всего 3-4 цвета. Референс палитры: **Flexoki** 2.0.0.

### R-11. Tantivy: инкрементальный индекс и внешние изменения

**Суть.** Индекс должен переживать перезапуск и переживать изменения файлов извне (git pull, синхронизация облака). Массовое изменение (100+ файлов сразу) не должно вешать UI.

**Митигация.** Хранить рядом с индексом карту `path → (mtime, size, hash)`; при старте — быстрая сверка (только stat, без чтения) и переиндексация расхождений; коммиты пакетами по 200–500 документов; события watcher'а класть в очередь с дебаунсом 500 мс; всю индексацию гнать в отдельном потоке через `rayon` 1.12.0, сообщая прогресс во фронтенд событием.

### R-12. WebView2 — движок, который вы не контролируете

**Суть.** WebView2 — это Chromium/Edge Stable, но с **отдельным циклом обновления** от самого браузера Edge: Evergreen Runtime обновляется независимо (и «hard-linked» с Edge, когда версии совпадают). Регрессии прилетают пользователю без вашего релиза. Важное ограничение Microsoft: **приложениям запрещено использовать установленный Edge Stable как рантайм** — только сам WebView2 Runtime. Поведение может расходиться между Windows 10 и 11.

Для сравнения: Electron 44.2.0 фиксирует Chromium 152.0.7977.76 и Node 24.20.0 — там движок под полным контролем, ценой 384 МБ.

**Митигация.** Не использовать самые свежие веб-API без проверки на минимальной целевой версии; логировать версию WebView2 в crash-лог (`tauri-plugin-log`). Крайняя мера при критичной регрессии — `webviewInstallMode: fixedVersion` (+180 МБ по докам Tauri / «over 250 MB» по Microsoft), но тогда **обновление рантайма становится вашей обязанностью** и требует перевыпуска сборки.

### R-13. Экспорт в DOCX формул и диаграмм

**Суть.** `docx` (dolanmiu) не умеет ни LaTeX, ни SVG. Mermaid отдаёт SVG, KaTeX — HTML+CSS.

**Митигация.** Формулы: рендерить через **Temml** в MathML → конвертировать в OMML (Word понимает OMML нативно; XSLT-преобразование MathML→OMML общеизвестно) — либо, как быстрый путь, растрировать в PNG. Диаграммы: SVG → PNG (canvas) и вставлять как изображение.

### R-14. Единая модель документа между тремя режимами

**Суть.** Самый недооценённый архитектурный риск. Read, Edit и Rich хранят состояние по-разному: Read — HTML, Edit — `EditorState` CM6, Rich — ProseMirror-документ. Наивное переключение вкладок = три источника истины и гарантированная рассинхронизация.

**Митигация (архитектурное решение, принять до написания кода).**
- Единственный источник истины — **строка markdown** в zustand-сторе.
- При входе в режим — гидратация из строки; при выходе — дегидратация обратно (для Rich — только если был dirty).
- Позиция курсора/скролла конвертируется через номер строки, а не через смещение в символах.
- Undo/redo **не** общий: у каждого режима свой стек (объединение стеков CM6 и ProseMirror — отдельный большой проект, который делать не нужно).

### R-15. `fetch` и CORS изнутри webview

**Суть.** Обращения к сети напрямую из webview в Tauri исторически проблемные: в трекерах Tauri и plugins-workspace больше 40 issue по теме fetch/CORS. Большинство закрыты, но тема живая — например, открытый [tauri#9454](https://github.com/tauri-apps/tauri/issues/9454) «missing Origin header» в v2. Для нашего приложения это касается загрузки удалённых картинок в заметках, проверки обновлений и любых будущих интеграций.

**Митигация.** Всё сетевое — через **`tauri-plugin-http`** (`@tauri-apps/plugin-http` 2.6.0) или собственные Rust-команды, а не через браузерный `fetch`. Это заодно снимает CORS как класс и даёт контроль над таймаутами и прокси. Для офлайн-приложения это в любом случае правильная архитектура.

### R-16. Копирование как rich text не работает через веб-API в WebView2 — БЛОКЕР

**Суть.** Стандартный паттерн «положить в буфер одновременно `text/html` и `text/plain`» — то, на чём держится вставка в Word/Gmail/Outlook — **сломан в WebView2**: при записи нескольких MIME-типов сохраняется **только последний**. Это официально зафиксировано: [WebView2Feedback#4801](https://github.com/MicrosoftEdge/WebView2Feedback/issues/4801), закрыт как **«not planned»**, в обычном Edge не воспроизводится. Сопутствующая проблема: скопированное из WebView2 не попадает в историю буфера Win+V ([#5649](https://github.com/MicrosoftEdge/WebView2Feedback/issues/5649), open).

**Митигация — только Rust.** Реализовать Tauri-команду «копировать как rich text», которая одной сессией `OpenClipboard`/`EmptyClipboard`/`SetClipboardData` кладёт **CF_HTML + CF_UNICODETEXT**. База — `arboard` 3.6.1 (обёртка над `clipboard-win` 5.4.1), но **встроенного CF_HTML в `clipboard-win` нет**: формат надо зарегистрировать вручную через `RegisterClipboardFormat("HTML Format")` и самому собрать CF_HTML-обёртку с обязательными заголовками `StartHTML`/`EndHTML`/`StartFragment`/`EndFragment`. Примерно 80 строк, но это **единственный работающий путь** на Windows.

### R-17. Drag-and-drop файлов в Tauri на Windows — компромисса нет

**Суть.** [tauri#15138](https://github.com/tauri-apps/tauri/issues/15138), **закрыт как «not planned»**: при `dragDropEnabled: true` нативный OS-listener перехватывает события и блокирует HTML5 `dragover`/`preventDefault()` — курсор показывает «Forbidden» даже над валидной drop-зоной. При `dragDropEnabled: false` появляется веб-DnD, но **пропадает доступ к `dataTransfer` для внешних файлов**. Гибридного режима не существует. Есть открытый запрос на получение пути файла в drag-событиях: [tauri#15861](https://github.com/tauri-apps/tauri/issues/15861).

**Митигация.** Выбрать `dragDropEnabled: true` (пути на диске нужнее) и рисовать **собственную визуальную индикацию drop-зоны** по событиям `tauri://drag-enter` / `drag-over` / `drag-drop` / `drag-leave`, не полагаясь на системный курсор. Пользователь увидит подсветку зоны — «запрещающий» курсор станет незаметен.

### R-18. Windows Defender ложно срабатывает на неподписанные сборки

**Суть.** [tauri#2486](https://github.com/tauri-apps/tauri/issues/2486) (open, «help wanted»): Defender помечает сборки как `Trojan:Script/Wacatac.B!ml`, в том числе при `tauri dev`. Это бьёт и по разработке, и по первым пользователям.

**Митигация.** Для разработки — исключение папки проекта в Defender. Для распространения — code signing сертификат; для некоммерческого проекта это расход, поэтому как минимум заранее подготовить объяснение в README и на странице загрузки. Накопление репутации SmartScreen занимает время даже с подписью.

### R-19. Обновление приложения принудительно закрывает окно

**Суть.** Из официальных доков `tauri-plugin-updater`: **«On Windows the application is automatically exited when the install step is executed due to a limitation of Windows installers»**. Приложение просто исчезнет в момент установки.

**Митигация.** Перед вызовом установки — принудительно сохранить все грязные документы, зафиксировать состояние окна и сессию открытых вкладок, показать явное предупреждение «приложение закроется». Никогда не запускать установку молча в фоне.

### R-20. Лицензионная гигиена

Проект некоммерческий, поэтому блокеров нет, но стоит зафиксировать:
- **MPL-2.0**: `@blocknote/*` (отклонён), `mdast2docx`, `spellbook`, `nucleo`, `@terrastruct/d2` — file-level copyleft, для приложения безопасен.
- **MPL-1.1**: `lunr-languages` (отклонён).
- **GPL-3.0**: `slint` (отклонён) — единственный настоящий copyleft среди рассмотренных зависимостей.
- **GPL-2.0+**: **pandoc**, если будет использоваться. Вызов неизменённого внешнего бинарника, найденного в PATH, — юридически безопасен и GPL не «заражает» приложение. **Но при бандлинге pandoc в инсталлятор придётся соблюдать условия распространения GPL-кода** (исходники/оффер). Рекомендуемый режим: только «если найден в системе».
- **BSL-1.0**: `clipboard-win` — permissive, без обязательства указывать в бинарнике.
- **CC0-1.0**: `notify` — public domain, никаких обязательств.
- **OFL-1.1**: IBM Plex Mono — шрифт можно распространять с приложением; нельзя продавать сам шрифт.
- **Apache-2.0**: `harper`, `@atlaskit/pragmatic-drag-and-drop`, `typst`, `@playwright/test`, `gpui`, `flexsearch`, `fuse.js` — требуют сохранения NOTICE.
- **Unlicense**: `markdown-it-anchor`, `ignore`, `globset`, `markdown-it-highlightjs` — public domain.
- **LGPL-2.1+**: `jschardet` (отклонён — и хорошо, LGPL в бандле требует возможности замены библиотеки).

---

## Приложение: полный список пакетов для установки

### npm — runtime

```
# оболочка
@tauri-apps/api@2.11.1
@tauri-apps/plugin-fs@2.5.2
@tauri-apps/plugin-dialog@2.7.3
@tauri-apps/plugin-opener@2.5.5
@tauri-apps/plugin-store@2.4.4
@tauri-apps/plugin-clipboard-manager@2.3.3
@tauri-apps/plugin-global-shortcut@2.3.2
@tauri-apps/plugin-deep-link@2.4.10
@tauri-apps/plugin-updater@2.11.0
@tauri-apps/plugin-window-state@2.4.1
@tauri-apps/plugin-process@2.3.1
@tauri-apps/plugin-os@2.3.2
@tauri-apps/plugin-log@2.9.1
@tauri-apps/plugin-http@2.6.0

# UI
react@19.2.8
react-dom@19.2.8
zustand@5.0.15
@tanstack/react-virtual@3.14.10
cmdk@1.1.1
tinykeys@4.0.0
react-resizable-panels@4.12.3
@radix-ui/react-context-menu@2.3.7
@floating-ui/react@0.27.20
@atlaskit/pragmatic-drag-and-drop@3.1.0
@fontsource/ibm-plex-mono@5.3.0
lucide-react@1.41.0

# редактор Edit
@codemirror/state@6.7.4
@codemirror/view@6.43.11
@codemirror/commands@6.11.0
@codemirror/language@6.12.4
@codemirror/lang-markdown@6.5.2
@codemirror/search@6.7.2
@codemirror/autocomplete@6.20.3
@codemirror/lint@6.9.7
@codemirror/language-data@6.5.2
@lezer/markdown@1.7.2
@lezer/highlight@1.2.3
@lezer/common@1.5.2
@replit/codemirror-vim@6.4.0
@replit/codemirror-indentation-markers@6.5.3

# редактор Rich
@milkdown/crepe@7.22.1
@milkdown/kit@7.22.1

# рендер Read
markdown-it@15.0.1
markdown-it-anchor@10.0.0
markdown-it-emoji@3.1.0
markdown-it-deflist@4.0.0
@mdit/plugin-footnote@1.1.0
@mdit/plugin-tasklist@1.1.0
@mdit/plugin-katex@1.1.0
@mdit/plugin-container@2.0.0
@mdit/plugin-alert@2.0.0
@mdit/plugin-attrs@1.3.0
@mdit/plugin-mark@2.1.0
@mdit/plugin-sub@1.1.0
@mdit/plugin-sup@1.1.0
@mdit/plugin-dl@1.1.0
@mdit/plugin-abbr@1.1.0
@mdit/plugin-figure@1.2.0
@mdit/plugin-img-size@1.1.0

# AST-анализ (backlinks, outline, rename)
unified@11.0.5
remark-parse@11.0.0
remark-gfm@4.0.1
remark-frontmatter@5.0.0
remark-stringify@11.0.0
mdast-util-from-markdown@2.0.3
mdast-util-to-markdown@2.1.2
mdast-util-gfm@3.1.0
unist-util-visit@5.1.0

# подсветка, математика, диаграммы
shiki@4.4.3
@shikijs/markdown-it@4.4.3
@shikijs/transformers@4.4.3
katex@0.18.5
mermaid@11.17.2

# поиск, данные, утилиты
@leeoniya/ufuzzy@1.0.19
yaml@2.9.0
markdown-table@3.0.4
diff@9.0.0
medium-zoom@1.1.0

# импорт / экспорт
turndown@7.2.4
@joplin/turndown-plugin-gfm@1.0.67
mammoth@1.12.2
mdast2docx@1.6.1
docx@9.7.1
dom-to-image-more@3.10.2

# орфография
nspell@2.1.5
dictionary-ru@3.0.0
dictionary-en@4.0.0

# i18n
@inlang/paraglide-js@2.25.0
```

### npm — dev

```
@tauri-apps/cli@2.11.4
vite@8.2.2
typescript@7.0.2
@vitejs/plugin-react
vitest@5.0.0
@playwright/test@1.63.0
prettier@3.9.6
```

### Cargo (`src-tauri/Cargo.toml`)

```toml
[dependencies]
tauri = { version = "2.11", features = ["protocol-asset"] }
tauri-plugin-fs = "2.5"
tauri-plugin-dialog = "2.7"
tauri-plugin-opener = "2.5"
tauri-plugin-store = "2.4"
tauri-plugin-clipboard-manager = "2.3"
tauri-plugin-global-shortcut = "2.3"
tauri-plugin-single-instance = "2.4"
tauri-plugin-deep-link = "2.4"
tauri-plugin-updater = "2.11"
tauri-plugin-window-state = "2.4"
tauri-plugin-process = "2.3"
tauri-plugin-os = "2.3"
tauri-plugin-log = "2.9"
tauri-plugin-persisted-scope = "2.3"
tauri-plugin-http = "2.6"

# файловая система
notify = "8.2"
notify-debouncer-full = "0.7"
tempfile = "3.27"
trash = "5.2"
ignore = "0.4"
globset = "0.4"
walkdir = "2.5"
encoding_rs = "0.8"
chardetng = "1.0"

# поиск
tantivy = "0.26"

# изображения
image = "0.25"
imagesize = "0.15"

# буфер обмена и печать (Windows)
arboard = "3.6"          # rich-text: CF_HTML + CF_UNICODETEXT (см. R-16)
webview2-com = "0.39"    # PrintToPdf (см. R-5), Windows-only

# прочее
serde = { version = "1", features = ["derive"] }
serde_json = "1.0"
rayon = "1.12"
similar = "3.2"          # опционально: diff на бэкенде
comrak = "0.54"          # опционально: рендер/экстракт текста на бэкенде
git2 = "0.21"            # опционально: история версий через libgit2

[build-dependencies]
tauri-build = "2.6"

[dev-dependencies]
# tauri-driver = "2.0"   # опционально, WebDriver-тесты (Windows/Linux)
```

### Что установить в системе (Windows 11)

1. **Visual Studio Build Tools** + workload «Desktop development with C++» (MSVC + Windows SDK)
2. **rustup**, toolchain `stable-x86_64-pc-windows-msvc` (`rustup default stable-msvc`), Rust ≥ 1.77.2
3. **Node.js LTS**
4. **WebView2 Runtime** — **уже предустановлен в Windows 11** (Microsoft: «will be included as part of the Windows 11 operating system»)
5. **VBSCRIPT** (Settings → Apps → Optional features) — только если собираем MSI; для NSIS не нужен
6. Исключение папки проекта в Windows Defender — иначе возможны ложные срабатывания `Trojan:Script/Wacatac.B!ml` (см. R-18)

### Спайки, которые надо сделать в первую неделю

Пять экспериментов, каждый по нескольку часов, которые закрывают все «не проверено» из этого документа и определяют архитектуру:

1. **PrintToPdf** через `webview2-com` + `with_webview` → определяет стратегию экспорта (R-5).
2. **Вставка картинки из буфера**: веб-`paste` → официальный плагин → CrossCopy. Включая скриншот Win+Shift+S и PNG с прозрачностью (R-3).
3. **CF_HTML в буфер из Rust** и вставка результата в Word и Gmail (R-16).
4. **Round-trip Crepe** на 30–50 реальных файлах: `parse → serialize → diff`. Если потери неприемлемы — сразу смотреть `@atomic-editor/editor` (R-1).
5. **Frameless-окно + Snap Layouts**: `tauri-plugin-decorum` либо `tauri-plugin-snap-layout` на Windows 11 (R-2).

---

*Все версии и даты в документе получены прямыми запросами к registry.npmjs.org, crates.io и GitHub 2026-09-05. Утверждения о поведении библиотек, помеченные «не проверено», требуют подтверждения экспериментом на раннем этапе разработки — все они собраны в разделе «Риски».*
