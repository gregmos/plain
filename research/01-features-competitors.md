# 01 — Инвентаризация функций: десктопные Markdown-редакторы и ридеры

**Дата исследования:** 2026-09-05
**Цель:** база для ТЗ на «Plain» — минималистичный Windows-десктоп markdown reader/editor (три поверхности: Read / Edit raw / Rich; библиотека в левом рейле).
**Метод:** официальные docs и changelog'и продуктов, GitHub issues (сортировка по 👍), Obsidian/Bear/Ulysses/Logseq forums, Hacker News, Windows Insider Blog, Microsoft Learn. Каждое утверждение о фиче привязано к источнику (раздел 5).

> ⚠️ Ограничение метода: Reddit был недоступен инструментам сбора в этой сессии. Пользовательские жалобы собраны из GitHub issues, Discourse-форумов продуктов и HN — это более верифицируемые источники (видны номера issue и счётчики реакций), но охват «бытовых» жалоб чуть уже.

---

## Легенда

**Оценка ценности для минималистичного ридера/редактора:**

| Метка | Смысл |
|---|---|
| **Must** | Без этого продукт не решает задачу; в MVP |
| **Should** | Сильно повышает ценность; в v1.0 |
| **Could** | Приятно, но откладываемо; v1.x+ |
| **Won't** | Сознательно не делаем (ломает минимализм / чужой класс продукта) |

**Коды продуктов:** `Obs` Obsidian · `Typ` Typora · `iA` iA Writer · `Bear` Bear · `Ulys` Ulysses · `MT` MarkText · `Zet` Zettlr · `GW` Ghostwriter (KDE) · `Ink` Inkdrop · `Jop` Joplin · `Log` Logseq · `Ntb` Notable · `QON` QOwnNotes · `VN` VNote · `PW` PanWriter · `SE` StackEdit · `HD` HedgeDoc/HackMD · `MM` Markdown Monster · `VSC` VS Code (built-in) · `MAIO` Markdown All in One · `MPE` Markdown Preview Enhanced · `Foam` Foam · `Zed` Zed · `Hlx` Helix · `AFF` AFFiNE · `Any` Anytype · `DD` Deepdwn · `MDH` MDHero · `Mk2` Marked 2 (macOS, эталон «ридера») · `NP` Notepad (Windows 11) · `PT` PowerToys.

---

## 1. Сводная таблица продуктов

| Продукт | Версия / цена / платформы | Позиционирование | 5 главных отличительных фич | Чего не хватает пользователям |
|---|---|---|---|---|
| **Obsidian** | 1.14.0 (2026-09-02); free, Sync $4–5/мес, Publish $8–10/мес; Win/Mac/Lin/iOS/And | Локальный PKM поверх папки .md | 1) Live Preview (гибрид) 2) Wikilinks + backlinks + graph 3) Callouts `> [!type]` (14 типов) 4) 7 281 community-плагин 5) Bases — БД-вьюхи над properties (1.9+) | Нет vault-wide find&replace (запрос с 2020, 260+ 👍); деградация на больших vault'ах; нет Print; PDF-экспорт без контроля разрывов страниц; плагины без песочницы; проблемы со скринридерами |
| **Typora** | 1.14.9; $14.99 разово / 3 устройства; Win/Mac/Lin | «A minimal Markdown editor and reader» — чистый WYSIWYG | 1) Настоящий однопанельный WYSIWYG 2) MathJax 4 + Mermaid 11.12 3) Экспорт через встроенный Pandoc (docx/epub/LaTeX) 4) Focus (F8) / Typewriter (F9) 5) Multi-file regex search + replace | Нет вкладок на Windows/Linux (#638, 77 👍, ~9 лет); нет plugin API (#162, 10 лет); нет command palette; нет wikilinks/backlinks; нет split preview; лаги >10k слов, не открывает 4 МБ; закрытый исходник |
| **iA Writer** | Win 2.0.9172; разово $29.99 (Win) / $49.99 (Mac); Win/Mac/iOS | «Benchmark of Markdown writing apps» — фокус на письме | 1) Focus Mode (sentence/paragraph) + Typewriter 2) Syntax Highlight по частям речи 3) Style Check (клише/филлеры) 4) Content Blocks (встраивание csv/img/md) 5) Authorship — трекинг AI/вставленного текста | Нет backlinks/graph (обещаны с 2022); нет плагинов; wikilinks только на Apple, не на Windows; нет custom CSS; отдельная цена за каждую платформу |
| **Bear** | 2.9.4; free / Pro $2.99 мес; **только Apple** (+ Web beta) | Красивые заметки в БД, теги вместо папок | 1) Panda-редактор (hybrid live-markup) 2) Вложенные теги произвольной глубины 3) Callouts + Mermaid (2026) 4) BearCLI + официальный MCP-сервер 5) Экспорт в 10 форматов | Нет Windows/Android «и не планируется»; нет version history (топ-запрос, 28+ 👍); нет папок; нет raw-source view; нет command palette; lock-in в БД (сам вендор выпустил Lettera для plain .md) |
| **Ulysses** | v40; подписка $5.99/мес; **только Apple** | Инструмент длинной формы: Library → Groups → Sheets | 1) Markdown XL (28 тегов: comments, redact, annotations) 2) Typewriter с Fixed Scrolling 3) Export Styles (CSS) для PDF/DOCX/ePub 4) Keywords + смарт-фильтры 5) Локальные автобэкапы по расписанию | Только подписка, при отмене — read-only; проприетарный формат; нет wikilinks/task lists/highlight; нет Windows; слабый структурный аутлайнер против Scrivener |
| **MarkText** | 0.19.1 (2026-06-06), 0.20.0-rc.1; free, MIT; Win/Mac/Lin | Бесплатный WYSIWYG-клон Typora | 1) Realtime preview на собственном движке **Muya** + CodeMirror 5 для Source 2) CommonMark+GFM+часть Pandoc, KaTeX, Mermaid, PlantUML, front matter (YAML/TOML/JSON) 3) 33 встроенные темы 4) Source/Typewriter/Focus modes 5) Paste image из буфера | **Был заброшен ~3 года** (после v0.17.1, март 2022), возрождён в мае 2026 ([#4191](https://github.com/marktext/marktext/issues/4191)); **переписывает файл при открытии/сохранении** (#2189, 43 👍); зависает на 300k слов (#4887); reload при ложном срабатывании детектора OneDrive **теряет несохранённое** (#2592); только одна папка-workspace (#2222); нет сносок, `==highlight==` (#5224), wikilinks (#2329), vim (#596, 101 👍), folding (#1869); экспорт только PDF/HTML/print |
| **Zettlr** | 4.7.0 (2026-07-26), коммиты ежедневно; free, GPLv3; Win/Mac/Lin | Академический markdown-IDE | 1) Zotero/JabRef/CSL — 9 000+ стилей цитирования 2) **Pandoc встроен в поставку** (не требует установки) — PDF/DOCX/ODT/ePub/LaTeX/30+ форматов 3) Zettelkasten ID + wikilinks + Related Files + Graph 4) Несколько workspace одновременно, тег-менеджер с IDF-ранжированием 5) Steering Committee с 2024 (снижен bus-factor) | Нет command palette / fuzzy-переключения вкладок ([#5077](https://github.com/Zettlr/Zettlr/issues/5077)); **не реагирует на внешнее изменение файла — нужен рестарт приложения** ([#4626](https://github.com/Zettlr/Zettlr/issues/4626)); нет автоматических backlinks (#810, 37 👍, с 2020); нет git (#1050, 29 👍); нет admonitions (#532/#4982/#6497); кастомные хоткеи появились только в 4.7.0; фризы при Ctrl+S с 2+ вкладками (#6079) |
| **Ghostwriter (KDE)** | Linux: **26.08.0** (2026-08-20); **Windows: последняя сборка 2022 года**; free, GPLv3 | Distraction-free писательский markdown | 1) Hemingway mode (Backspace отключён) 2) Focus по строке/предложению/абзацу/трём строкам 3) Outline HUD (Ctrl+J) 4) cmark-gfm встроен, опционально shell-out в Pandoc/MultiMarkdown 5) Статистика сессии, темы в стиле Ulysses III | **Windows-версия отстала на ~4 года, установщика нет** (KDE Bug #471793); **печать намеренно удалена**; нет Mermaid, YAML front matter (Bug #466199), wikilinks, KaTeX (MathJax только через Pandoc); потеря данных на сетевых папках (Bug #524940, август 2026); утечка памяти в Xorg (Bug #505519) |
| **Joplin** | 3.7.14 (2026-08-30); free, **AGPL-3.0**; Cloud €2.99–9.99/мес; Win/Mac/Lin/mob/CLI | Open-source Evernote-замена с E2EE | 1) Два редактора: markdown-split и Rich Text 2) markdown-it плагины (KaTeX, Mermaid, mark, footnote, TOC вкл.; sub/sup/deflist/abbr/emoji/multitable выкл.) 3) E2EE в любой бэкенд (Dropbox/OneDrive/WebDAV/S3/Nextcloud/ФС) 4) Лучший в классе импорт ENEX + импорт Obsidian (3.7.13) 5) **UI разрешения конфликтов с пословным diff** (3.7.12) + REST API + CLI | Заметки — .md с непортируемым метаданным-футером; RTE десктопа на TinyMCE, мобильного на ProseMirror — унификация только предложена ([#16277](https://github.com/laurent22/joplin/issues/16277)); RTE «не пытается делать markdown красивым» → переписывает разметку; потери данных при sync (#13531, #14954, #15246); иерархические теги (#375, 121 👍); нет DOCX-экспорта; серия XSS/path-traversal-уязвимостей 2025–2026 |
| **Logseq** | legacy 0.10.15; **«Logseq 2.0» DB — 2.0.1 Beta от 2026-07-13, стабильной версии нет**; free, AGPL-3.0 | Outliner-first PKM на блоках | 1) Блочная модель + block refs + `{{embed}}` 2) Daily notes 3) Queries/Datalog 4) Whiteboards 5) Плагины | В README **до сих пор висит предупреждение о возможной потере данных**; мобильные приложения DB-ветки в alpha; **DB-версия переносит граф в SQLite — .md перестаёт быть источником истины** (главный страх сообщества, тред с 61 тыс. просмотров); катастрофическая скорость на больших графах (4 мин на 2 000 страниц); EOL-Electron (#11378, 43 👍); XDG-пути (#3462, 79 👍); namespaces объявлены deprecated, `#tag` конвертируется в `[[tag]]` |
| **Inkdrop** | v6 (2026-08); $9.98/мес, **бесплатного тарифа нет**; **ядро закрыто**; Win/Mac/Lin/mob | Платные заметки для разработчиков, с 2026 — «AI-native» | 1) CodeMirror + slash-команды + floating toolbar 2) E2EE sync «из коробки» 3) Всё — плагины (Mermaid/math/emoji на одном API) 4) Telescope (fuzzy palette) 5) Локальный REST API + собственный **MCP-сервер** | Данные в локальной PouchDB-базе, а не в .md; **автор явно отказался делать wikilinks/backlinks** («Inkdrop — не приватная вики»); один разработчик = высокий bus-factor; только подписка |
| **Notable** | **последний релиз v1.8.4 (2020-01-21), последний коммит март 2023**; лицензия отсутствует | «Markdown-based note-taking, no lock-in» | 1) Заметки — файлы на диске 2) KaTeX + MhChem + AsciiMath + Mermaid 3) Wikilinks, сноски (в т.ч. inline), нативные `~sub~`/`^sup^` 4) Monaco-редактор (как в VS Code) 5) Zen mode | **Проект закрыл исходники на середине жизни** (SOURCE_CODE.md: «новые версии недоступны») и остановился; 732 открытых issue и свежие баг-репорты вплоть до августа 2026; топ-запросы не реализованы: поиск-замена по всем заметкам (#140, 168 👍), история версий (#116, 136 👍), WYSIWYG (#284, 89 👍), TOC/outline (#530, 60 👍), свои темы (#104, 53 👍) |
| **QOwnNotes** | 26.9.1 (2026-09-04, релизы почти еженедельно); free, GPL-2.0, Qt-native | Нативные plain-text заметки + Nextcloud | 1) Свой виджет QMarkdownTextEdit + **QLiteHtml вместо Chromium** — сознательный отказ от Electron 2) Nextcloud/ownCloud: версии и корзина с сервера 3) **Локальное git-версионирование папки заметок** (опционально) 4) Скриптовый движок (QML) + шифрование заметок 5) Ctrl+Shift+A — поиск по действиям (аналог палитры) | Нет math/KaTeX; нет regex в строке поиска-и-создания (#2022); фильтр тегов без OR/AND (#1702); нет пакетного экспорта (#490); внешние изменения не ловятся при перезаписи через move (#3468); один мейнтейнер |
| **VNote** | v4.6.0; активная разработка (коммиты сентябрь 2026); free, LGPL-3.0, C++/Qt | Нативный notebook-редактор для markdown | 1) C++/Qt + собственный VTextEdit — без Electron 2) «United Entry» — палитра/быстрый переход (`n` файлы, `g` содержимое, `b` буферы, теги) 3) Mermaid/PlantUML/Graphviz/Flowchart.js/WaveDrom + MathJax 4) Callouts (alert boxes), `==highlight==`, sup/sub, `[TOC]` 5) Экспорт PDF/HTML + Pandoc для DOCX/ePub, печать | Нет backlinks — запрос открыт 6+ лет ([#1364](https://github.com/vnotex/vnote/issues/1364)); нет wikilinks и emoji; теги только для «bundled» блокнотов; утечки памяти на больших файлах (#410, #1606); нет focus/typewriter-режимов |
| **PanWriter** | 0.8.10 (2026-01-12); free, GPL-3.0, Electron | Тонкая GUI-обёртка над Pandoc | 1) Импорт/экспорт во всё, что умеет Pandoc 2) **Превью со страницами и разрывами через paged.js** 3) Distraction-free 4) Front matter как настройки Pandoc 5) Живое редактирование CSS-темы | Требует установленный Pandoc; **скролл-синхронизация сломана с 2022** (#95, топ-issue); **нет автоперезагрузки при внешнем изменении** (#66, с 2021); нет Mermaid (#71), outline-панели, поиска-замены; CodeMirror 5; macOS-сборка не подписана |
| **StackEdit** | **v5.15.4 (2023-05-27), 3 года без коммитов**; Apache-2.0, только браузер | Браузерный markdown с sync | 1) Точный scroll sync 2) GFM + Markdown Extra + CommonMark 3) KaTeX, UML, ABC, emoji, `==highlight==`, abbr, deflist, sup/sub 4) Sync с Google Drive/Dropbox/GitHub/GitLab 5) Публикация в Blogger/WordPress/Zendesk | Фактически заброшен ([#1876](https://github.com/benweet/stackedit/issues/1876) «Project abandoned?» без ответа), форум community.stackedit.io недоступен; **sync через Google Drive портит текст** (#1882, октябрь 2025, без ответа); нет глобального поиска (#1347); нет десктопной версии (#323) |
| **HedgeDoc / CodiMD / HackMD** | HedgeDoc 1.12.0 (2026-08-21, активен; 2.0 в alpha) · CodiMD 2.6.1 (низкая активность) · HackMD — закрытый SaaS | Совместный markdown в реальном времени | 1) Совместное редактирование через **OT (не CRDT)**, с курсорами участников 2) Slide mode на reveal.js 3) HFM: сноски, deflist, abbr, `==highlight==`, sup/sub, alerts, TOC, YAML 4) 6-уровневая модель прав 5) Self-hosting + OAuth/SAML/LDAP | Веб, не десктоп (десктоп-приложение HackMD заброшено с 2019); **нет полнотекстового поиска** (HedgeDoc [#460](https://github.com/hedgedoc/hedgedoc/issues/460); у HackMD — только в платном тарифе); нет wikilinks и цитирования (#2873); CodeMirror 5; история ревизий хранится JSON-блобами (CodiMD #1566) |
| **Markdown Monster** | 4.4 stable (2026-05-31), 4.5 beta; **платный, $399 на 5 мест; исходники закрыты**; **только Windows (WPF + WebView2)** | Windows-редактор для блогеров и техписателей | 1) Deep Git integration с диалогом коммита 2) Публикация в WordPress/MetaWeblog/Jekyll/Ghost/Hugo/Medium 3) Встроенный screen capture + paste image 4) Markdig: callouts `:::note`, KaTeX/MathJax, Mermaid, PlantUML, abbr, генерация TOC 5) Command palette, .NET addin-модель, CLI, авто-бэкап `.md.saved.bak` при наборе | Платный и закрытый несмотря на GitHub-репозиторий; **экспорт только PDF/HTML — нет DOCX/ePub/LaTeX, Pandoc не используется**; нет wikilinks (#1276); typewriter-режим отклонён как wontfix (#694); превью деградирует после ~2 000 строк, документы >500 КБ «вызывают заметные проблемы» (собственный FAQ); редактор мигрирует с ACE на Monaco только в 4.5 |
| **VS Code (built-in)** | 1.13x (2026) | Редактор кода, который «умеет» markdown | 1) **Mermaid встроен с 1.121** (2026-05) 2) KaTeX встроен (`markdown.math.enabled`) 3) Link validation + update links on move/rename 4) Paste/drop изображений (`markdown.copyFiles.destination`), paste URL as link 5) **Экспериментальный Hybrid Markdown Editor** (1.131/1.132/1.135) — WYSIWYG + markdown-diff | Outline показывает литеральные `#` (#53992, 109 👍, с 2018); нет авто-открытия preview (#2766, 90 👍); нет language-aware word wrap (#164267, 65 👍); нет форматтера таблиц; нет native GitHub Alerts (#209652, 47 👍); нет шаблона имени вставляемой картинки (#183560, 52 👍) |
| **Markdown All in One** | 3.6.3 (обновлён 2025-03), 14.4 млн установок | Дополняет VS Code редактированием | 1) Ctrl+B/I/Alt+S, Ctrl+Shift+[/] уровни заголовков 2) TOC с автообновлением и GitHub-slug 3) Автопродолжение и перенумерация списков 4) Форматтер GFM-таблиц 5) Print to HTML | Не обновлялся ~18 мес; таблицы ломаются на emoji/не-BMP (#151); лаги Enter/Backspace (#855, #423) |
| **Markdown Preview Enhanced** | 0.8.33 (2026-09-02), 10.2 млн установок | «Тяжёлый» рендер-движок для превью | 1) Mermaid/PlantUML/Graphviz/Vega/WaveDrom/D2/TikZ 2) Исполняемые code chunks 3) Экспорт Pandoc/eBook/PDF (Puppeteer/Prince) 4) reveal.js презентации 5) Импорт файлов в документ | Тяжёлый; собственный диалект; сложные настройки |
| **Foam** | 0.44.6 (2026-09-01), 273k установок | Obsidian-подобный PKM внутри VS Code | 1) Wikilinks + автодополнение 2) Backlinks panel 3) Graph view 4) Daily notes + templates 5) Tag explorer, orphans/placeholders | Сам себя называет alpha-grade; функции нестабильны |
| **Zed** | 2026 | Быстрый нативный редактор кода | 1) Встроенный preview (`cmd-shift-v`, `cmd-k v`) 2) Tree-sitter markdown 3) Автопродолжение списков, Prettier 4) Mermaid отрисовывается 5) LSP-расширения marksman / markdown-oxide | Нет math/KaTeX в preview (#40813, #10899, #60388); нет callouts/footnotes/emoji в preview (#23951); нет PDF-экспорта (#32137); баги рендера Mermaid |
| **Helix** | 2026 | Модальный терминальный редактор | 1) Нет preview и не будет (#2824) 2) `marksman` + `markdown-oxide` + `rumdl` в default languages.toml 3) tree-sitter подсветка 4) `.marksman.toml` как root-маркер 5) Внешние воркфлоу (go-grip, `gh markdown-preview`) | Ридер-опыт целиком снаружи редактора |
| **AFFiNE** | **v0.27.x — всё ещё до 1.0**; клиент MIT, **сервер source-available** (self-host без коммерческой лицензии — только для ревью); Free / Pro $6.75 мес / Believer $499 разово | Notion + Miro в одном | 1) BlockSuite: doc-режим и edgeless-канвас — один документ 2) Multi-view databases 3) Local-first (CRDT/Yjs + Rust «OctoBase») + self-host через Docker 4) AI-ассистент 5) Markdown import/export | Markdown — только формат обмена, не источник истины; **math-ввод и Mermaid до сих пор не завезены** ([#7450](https://github.com/toeverything/AFFiNE/issues/7450)); **локальное хранилище не шифруется** (#5491, 22 👍); нет колонок в стиле Notion (#7479, 54 👍); нет автобэкапа (#8399); экспорт канваса в PNG/SVG глючит (#12128) |
| **Anytype** | 0.5x (до 1.0); **лицензия «Any Source Available License 1.0» — не OSI-open-source**; Free / $4–16 мес; self-host сети возможен | Объектная база знаний с типами и связями | 1) Objects/Types/Relations + Sets 2) Локальное шифрование, ключ из 12-словной фразы 3) P2P-синхронизация (AnySync), режим local-only 4) Backlinks + граф 5) **CLI/headless-режим + локальный HTTP API** | **Данные хранятся зашифрованными фрагментами в `flatfs` — вне приложения недоступны**, markdown только на экспорт (и теряет состояние toggle-списков); чаты нельзя экспортировать вообще; жёсткая критика на HN за подмену термина «open source»; нет vim (#247, 100 👍), нет мультиокон/вкладок (#1490), слабая поддержка RTL/арабского (#757, #1373) |
| **Notepad (Win 11)** | 11.2512.10.0 (2026-01-21), в составе ОС | Штатный текстовый редактор с lightweight formatting | 1) Bold/italic/ссылки/списки/заголовки через тулбар (11.2504, май 2025) 2) Переключение «formatted ↔ markdown syntax» в статусбаре 3) Таблицы (11.2510, ноябрь 2025) 4) Strikethrough + вложенные списки (11.2512, январь 2026) 5) Форматирование целиком отключается в настройках | Нет TOC, поиска по библиотеке, картинок, math/mermaid, экспорта; редактирует, но не «читает» документ |
| **PowerToys** | Markdown preview handler для панели предпросмотра Explorer | Системная утилита | 1) Рендер .md в preview pane 2) Локальные картинки (выкл. по умолчанию, только из дерева документа) 3) Monaco-превью для 150+ типов кода 4) Sticky scroll и minimap в превью кода 5) SVG/PDF/G-code | **Нет thumbnail-хендлера для .md**; превью не постоянное; открытый запрос на отдельный «Markdown Reader» PowerToy (#45267) |
| **MDHero** | ~8 МБ, Tauri+Rust, MIT; Windows | Прямой аналог задачи: лёгкий .md-viewer | 1) GFM + KaTeX + Mermaid + alerts 2) View/Split/Edit 3) TOC-сайдбар, вкладки с drag-reorder 4) Тема следует настройке Windows 5) Регистрируется как обработчик .md, открывает GitHub-URL, Marp-слайды | Нет экспорта; нет поиска по библиотеке; молодой проект |
| **Marked 2** (macOS) | эталон класса «ридер» | Превьюер для любого текстового редактора | 1) Рендер при сохранении внешнего редактора + автоскролл к правке 2) Word/sentence count, reading time, grade level 3) Автоматический TOC с typeahead-поиском 4) 9 стилей превью + свой CSS 5) Экспорт HTML/DOCX/PDF/RTF | Только macOS — на Windows аналога класса нет |
| **Deepdwn** | $14.99; Win/Mac/Lin | Минималистичный, но насыщенный редактор | 1) Mermaid, LaTeX/AsciiMath, wikilinks, footnotes, ABC-ноты, гитарные табы 2) Outline + backlinks + теги 3) Focus/typewriter/fullscreen 4) Word count по дням/месяцам, «стрики» 5) Vim mode, smart table formatting, folding | Малоизвестен; экспорт только HTML/PDF |

---

## 2. Полная категоризированная инвентаризация функций

> Формат: **Функция** — описание в одну строку · *где есть* · **Оценка** — обоснование.

### 2.1 Чтение (reading experience) — 24

| # | Функция | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| R1 | Read-first открытие | Двойной клик по .md сразу показывает отрендеренный документ, не исходник | MDH, Mk2, NP(частично) | **Must** | Ядро продукта, главный незакрытый спрос |
| R2 | Режим чтения без каретки | Текст выделяем, но не редактируем; нет курсора и мигания | Obs (Reading view), MDH, Mk2 | **Must** | Разделяет «читаю» и «правлю» |
| R3 | TOC-сайдбар | Автооглавление по заголовкам с кликабельным переходом | Typ, Obs, iA, Zet, GW, MDH, Mk2, MPE | **Must** | Топ-1 запрос в PowerToys #45267 |
| R4 | Подсветка активного раздела в TOC | Текущий заголовок подсвечен при скролле | Obs, MPE, Mk2 | **Should** | Дешёвая ориентация в длинном тексте |
| R5 | Sticky heading | Текущий заголовок «прилипает» к верху при прокрутке | VSC (sticky scroll), PT-Monaco | **Should** | Явно просят по аналогии с VS Code |
| R6 | Индикатор прогресса чтения | Полоса/процент прочитанного | MarkView-класс приложений | **Could** | Приятно, но не критично |
| R7 | Оценка времени чтения | «~7 мин чтения» в статусбаре | Mk2, ридеры | **Could** | Дёшево, любимо пользователями |
| R8 | Счётчик слов/символов | Живой счётчик, в т.ч. по выделению | Typ, iA, Ulys, GW, DD, Mk2 | **Should** | Ожидаемая база для писателей |
| R9 | Ограничение ширины строки (measure) | Колонка 60–80 символов, а не на весь монитор | iA, Typ, Ulys, Obs (CSS) | **Must** | Определяет читаемость на широком мониторе |
| R10 | Регулировка межстрочного интервала | Настройка line-height для чтения | VSC, Ulys, темы Obs | **Should** | Типографика — заявленное УТП |
| R11 | Zoom текста (Ctrl +/−/0) | Масштаб только контента, не всего UI | Typ, VSC, MDH | **Must** | Базовое ожидание любого ридера |
| R12 | Сворачивание секций по заголовкам | Схлопнуть раздел, чтобы обозреть структуру | VSC, Obs, DD, MT (запрошено #1869) | **Should** | Заменяет аутлайнер на длинных документах |
| R13 | Подсветка синтаксиса в код-блоках | Раскраска по языку из info-string | все | **Must** | Md-документы почти всегда с кодом |
| R14 | Кнопка «копировать код» | Копирование содержимого fence одним кликом | HD, MPE, Jop (просят #2383) | **Should** | Массовый запрос, тривиально в реализации |
| R15 | Перенос строк в код-блоках | Опция wrap вместо горизонтального скролла | MT (просят #2496), MPE | **Should** | Частая жалоба на узких окнах |
| R16 | Внутренние ссылки-якоря | Клик по `[..](#heading)` прокручивает к заголовку | все ридеры | **Must** | Иначе оглавления в документах мертвы |
| R17 | Внешние ссылки в браузере | http(s) открываются системным браузером, не в приложении | все | **Must** | Безопасность и предсказуемость |
| R18 | Запоминание позиции прокрутки | Файл открывается там, где закрыт | Obs (плагин, запрос forum #962) | **Should** | Топ-QoL, породил популярный плагин |
| R19 | Копирование как rich text | Выделенное вставляется в Word/почту с форматированием | Bear, Mk2, MM | **Should** | Постоянный запрос, «мост» в офис |
| R20 | Distraction-free / полноэкранный | F11: только текст, без хрома | Typ, GW, iA, Ulys, Ntb, DD | **Must** | Ожидаемо для «минималистичного» позиционирования |
| R21 | Поиск по документу с подсветкой всех совпадений | Ctrl+F, счётчик N/M, переход F3 | все | **Must** | Базовая функция ридера |
| R22 | Печать / предпросмотр печати | Ctrl+P, печать отрендеренного, не исходника | Typ, MM, MPE; **нет в Obs** (forum #54905) | **Should** | Отсутствие в Obsidian — известная боль |
| R23 | Hover-preview ссылки | Всплывающая карточка целевого документа | Obs, Foam | **Could** | Ценно только при библиотеке связей |
| R24 | Live reload при изменении файла на диске | Файл переписан извне → превью обновилось само | Mk2, MDH; **баг в VSC** #265277, **нет в MT** #656 | **Must** | Ключ к сценарию «редактирую в другом приложении / AI-агентом» |

### 2.2 Редактирование raw markdown — 24

| # | Функция | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| E1 | Подсветка синтаксиса markdown | Заголовки/код/ссылки визуально различаются в исходнике | все | **Must** | Минимум для режима Edit |
| E2 | Приглушение служебных символов | `**`, `#`, `[]()` тише текста, но видимы | iA, Obs Source, Bear | **Should** | Заявленный минималистичный стиль |
| E3 | Номера строк (опция) | Гуттер с номерами, выключаем | VSC, MDH, Ntb | **Could** | Нужно программистам, шумит остальным |
| E4 | Мягкий перенос (word wrap) | Длинные абзацы не уезжают горизонтально | все | **Must** | Проза не имеет «правой границы» |
| E5 | Автопродолжение списков | Enter создаёт следующий пункт, пустой Enter выходит | Typ, VSC+MAIO, Zed, Obs | **Must** | Иначе списки писать невозможно |
| E6 | Автонумерация упорядоченных списков | Перенумерация при вставке/удалении пункта | MAIO, Typ | **Should** | Устраняет ручную рутину |
| E7 | Tab / Shift+Tab — уровень пункта | Отступ/выступ списка, не вставка табуляции | Typ, MAIO, Zed; **баг MT** #2466 | **Must** | Часть базового ввода списков |
| E8 | Ctrl+B / Ctrl+I | Toggle жирного/курсива, в т.ч. снятие | Typ, Obs, MAIO, NP | **Must** | Универсальный мышечный навык |
| E9 | Обёртка выделения символом | Выделил и нажал `*`/`` ` `` — обернулось, а не заменилось | Obs, VSC | **Should** | Мелочь, которую замечают сразу |
| E10 | Paste URL на выделение → ссылка | Вставка ссылки поверх выделенного текста создаёт `[text](url)` | MAIO (#20), VSC (`pasteUrlAsFormattedLink`) | **Must** | Самая хвалимая микрофича редактирования |
| E11 | Мультикурсор | Ctrl+D / Alt+Click, массовое редактирование | VSC, Ntb, Obs | **Could** | Нужно немногим, но недорого через CodeMirror |
| E12 | Умные кавычки / typographer | Опциональная замена `--`→—, `"`→«» | Jop (выкл. по умолчанию), VSC preview | **Could** | Обязательно отключаемо — меняет байты файла |
| E13 | Автозакрытие скобок и бэктиков | `(`→`()`, ``` ` ```→`` ` ` `` | VSC, Obs | **Could** | Часть любит, часть ненавидит; под настройку |
| E14 | Комментарии, не попадающие в рендер | `%% %%` (Obsidian) или HTML-комментарии | Obs, Ulys (`++ ++`, `%% %%`) | **Should** | Черновые пометки без мусора в выводе |
| E15 | Гранулированный undo/redo | Отмена по словам/операциям, а не по символам | все на CodeMirror/Monaco | **Must** | Ожидание от любого текстового поля |
| E16 | Move line up/down, duplicate line | Alt+↑/↓, Ctrl+D | VSC, Ntb | **Could** | Привычка из кода, не для писателей |
| E17 | Форматирование таблицы | Выравнивание пайпов по Ctrl+Shift+F/на сохранении | MAIO, DD, MM | **Should** | Ручные таблицы иначе разъезжаются |
| E18 | Вставка таблицы диалогом | Задал N×M — получил каркас | Typ (Ctrl+T), NP (2025-11) | **Should** | Даже Notepad это сделал |
| E19 | Vim-режим | Модальное редактирование | VN, Jop, Ink, DD, Obs; просят в Typ #187 и MT #596 | **Could** | Громкое, но узкое меньшинство |
| E20 | Проверка орфографии | Подчёркивание, словари, добавление слов | GW, MM, DD, Zet | **Should** | Ожидание для текста на языке пользователя |
| E21 | Markdownlint | 60+ правил (MD001/MD009/MD040…), автофиксы | VSC+markdownlint (12.1 млн установок) | **Could** | Для техписателей, не для минимума |
| E22 | Форматтер (Prettier-совместимый) | Нормализация markdown по команде, никогда не автоматом | Zed, VSC | **Could** | Ровно то, чем MarkText себя убил (#2189) |
| E23 | Сниппеты / шаблоны | Вставка заготовок с переменными и табстопами | Zet, VSC, Foam | **Could** | Полезно, но не для v1 |
| E24 | Автодополнение путей и ссылок | Подсказки файлов и `#заголовков` при вводе `[](`/`[[` | VSC (`markdown.suggest.paths`), Obs, Foam, marksman | **Should** | Убирает главный источник битых ссылок |

### 2.3 WYSIWYG / live preview — 14

| # | Функция | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| W1 | Split preview (две панели) | Исходник слева, рендер справа | VSC (Ctrl+K V), Zed, MDH, MPE, SE, Ntb | **Should** | Дешёвый компромисс между Read и Rich |
| W2 | Синхронный скролл панелей | Прокрутка одной ведёт другую, двусторонне | VSC (2 настройки), SE, MPE | **Must** (если есть W1) | Без него split бесполезен |
| W3 | Однопанельный inline WYSIWYG | Разметка исчезает, остаётся результат | Typ, MT, Bear, AFF | **Should** | Поверхность «Rich» из макета |
| W4 | Hybrid live preview | Разметка проявляется только в строке с курсором | Obs Live Preview, Bear Panda, Flintmark | **Should** | Компромисс WYSIWYG без потери контроля |
| W5 | Переключение Source ↔ Preview одной клавишей | Ctrl+E / Ctrl+/ мгновенно, без потери позиции | Obs (Ctrl+E), Typ (Ctrl+/), MDH (Ctrl+E) | **Must** | Сердце трёхповерхностной модели |
| W6 | Round-trip fidelity | Файл после Rich-редактирования побайтово совпадает вне правки | Typ (в основном); **провал MT** #2189 | **Must** | Главная причина недоверия к WYSIWYG |
| W7 | Тулбар форматирования | Кнопки B/I/ссылка/список | NP, MM, Ink, SE | **Could** | Notepad доказал спрос; но шумит |
| W8 | Slash-команды | `/` вызывает меню блоков | Ink, AFF, Any, Log | **Could** | Ассоциируется с Notion, не с минимализмом |
| W9 | Floating/selection toolbar | Панель появляется над выделением | Ink, AFF | **Could** | Мешает при работе с клавиатуры |
| W10 | Визуальный редактор таблиц | Добавить/удалить строку/столбец, выравнивание | NP (2025-11), MM, DD; **нет в Typ** (#344, с 2016) | **Should** | 10-летняя дыра у лидера категории |
| W11 | Inline-рендер изображений в редакторе | Картинка видна прямо в исходнике | Typ, Obs LP, MT | **Should** | Иначе Rich-режим неполон |
| W12 | Inline-рендер формул и диаграмм | KaTeX/Mermaid отрисованы при вводе | Typ, Obs LP, Ink | **Could** | Дорого; можно только в Read |
| W13 | Раздельные шрифты для кода и прозы | Моно для fence, текстовый для прозы (или моно везде) | iA (Duo/Quattro), Typ-темы | **Should** | Прямо влияет на макет «IBM Plex Mono» |
| W14 | Drag-and-drop перестановка блоков | Мышью двигать абзацы/блоки | AFF, Log, Any | **Won't** | Блочная модель ломает plain-text контракт |

### 2.4 Синтаксис (поддерживаемые расширения markdown) — 35

| # | Синтаксис | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| S1 | CommonMark | Базовый нормативный диалект | все | **Must** | Фундамент, без вариантов |
| S2 | GFM tables | `\|`-таблицы с выравниванием `:--:` | все, кроме Ulys (свой редактор таблиц) | **Must** | Самое частое расширение в реальных .md |
| S3 | GFM task lists | `- [ ]` / `- [x]` | все, кроме Ulys | **Must** | Ожидание де-факто |
| S4 | Интерактивные чекбоксы в Read | Клик по чекбоксу правит файл | Obs, Jop, Log | **Could** | Нарушает read-only контракт |
| S5 | GFM strikethrough | `~~text~~` | все; NP с 11.2512 | **Must** | Часть GFM |
| S6 | GFM autolinks | Голый URL становится ссылкой | все | **Must** | Часть GFM |
| S7 | Footnotes | `[^1]` + определение | Obs, Typ, iA, Bear, MT, Jop, Zet, HD | **Must** | Не в GFM-спеке, но повсеместно |
| S8 | Inline footnotes | `^[текст]` | Obs, Jop, iA | **Could** | Диалектно, дешёво добавить |
| S9 | Math inline/block (KaTeX) | `$x$` / `$$…$$` | VSC (встроен), MT, Jop, Zet, Ink, iA, HD | **Must** | KaTeX быстрее и легче MathJax |
| S10 | MathJax / расширенный TeX | Химия, автонумерация, макросы | Typ (MathJax 4), Obs, GW | **Could** | Дорого по весу; KaTeX закрывает 95 % |
| S11 | Mermaid | Диаграммы из fence ```` ```mermaid ```` | Obs, Typ, Bear, MT-нет, Jop, Zet, Ink, VSC (встроен 1.121), Zed, MDH, DD | **Must** | Стало базовым ожиданием 2026 года |
| S12 | PlantUML | Требует Java/сервер | MPE, VN, HD; **явно отклонён Typ** #297 | **Won't** | Внешняя зависимость ломает «одно окно» |
| S13 | Прочие движки диаграмм (Graphviz/Vega/D2/WaveDrom) | Множество fence-языков | MPE, HD | **Won't** | Каждый — отдельный рантайм |
| S14 | Wikilinks `[[Note]]` | Внутренняя ссылка по имени файла | Obs, Log, Foam, Zet, Bear, DD, iA(Apple), marksman | **Should** | Нужны для чтения чужих vault'ов, хотя непортируемы |
| S15 | Wikilink с алиасом и заголовком | `[[Note#Heading\|alias]]` | Obs, Foam, marksman | **Should** | Иначе половина Obsidian-ссылок не отрендерится |
| S16 | Embeds / transclusion `![[…]]` | Вставка другого документа или блока | Obs, Log, Foam | **Could** | Только на чтение; писать не нужно |
| S17 | Block references `^id` | Ссылка на конкретный абзац | Obs, Log | **Could** | Хвост Obsidian-совместимости |
| S18 | Callouts `> [!type]` | 14 типов, сворачиваемые `+`/`-`, вложенные | Obs, Bear, Flintmark; просят в Zet #532 | **Must** | Массово встречается в существующих файлах |
| S19 | GitHub Alerts | `> [!NOTE\|TIP\|IMPORTANT\|WARNING\|CAUTION]` | GitHub, Typ (вкл. вручную), MDH; **нет в VSC** #209652 | **Must** | Любой README с GitHub |
| S20 | YAML front matter | `---` блок метаданных | Obs, MT, Zet, Jop, PW, Marp; **нет в Bear** | **Must** | Иначе первые строки файла выглядят мусором |
| S21 | Отображение front matter | Скрыть / показать как таблицу / как код | VSC (`markdown.preview.frontMatter`, 1.121) | **Should** | Три режима закрывают все вкусы |
| S22 | TOML/JSON front matter | `+++` / `{}` вместо YAML | Hugo/Zola-экосистема | **Could** | Узко, но парсинг тривиален |
| S23 | Emoji shortcodes | `:smile:` → 😄 | Typ, Bear, SE, HD, Jop (выкл.); **нет в Obs** без плагина | **Should** | Дёшево; ожидается в GitHub-документах |
| S24 | `==highlight==` | Выделение маркером | Obs, Typ, Bear, iA, Jop | **Must** | Один из самых частых «нестандартных» тегов |
| S25 | Superscript / subscript | `^2^` / `~1~` | Typ, iA, Jop (выкл.) | **Could** | Нужно науке, редко прозе |
| S26 | Abbreviations | `*[HTML]: HyperText…` | markdown-it-abbr, Jop (выкл.) | **Could** | Очень редко встречается |
| S27 | Definition lists | `Term` / `: определение` | markdown-it-deflist, Jop (выкл.), Pandoc; **нет в Typ** #2351 | **Could** | Спрос давний, но нишевый |
| S28 | Auto TOC маркер | `[toc]` / `{{TOC}}` разворачивается в оглавление | Typ, iA, Jop, HD | **Should** | Дешевле, чем ждать сайдбар |
| S29 | Inline HTML | `<br>`, `<img>`, `<details>` внутри markdown | все | **Must** | Реальные файлы им пропитаны |
| S30 | Санитизация HTML | Блокировка script/iframe/внешних ресурсов | VSC (Preview Security: Strict по умолчанию), PT (внешние картинки блокируются) | **Must** | Открываем чужие файлы — это модель угроз |
| S31 | `<details>/<summary>` | Сворачиваемые блоки | GitHub, все на HTML-рендере | **Should** | Массово в README |
| S32 | Heading anchors / `{#id}` | Явные якоря и атрибуты | markdown-it-attrs, Pandoc | **Could** | Нужно для ссылок в больших доках |
| S33 | Размер изображения в синтаксисе | `![alt\|200x100]` (Obsidian) / `=200x` (Typora) | Obs, Typ, Flintmark | **Should** | Иначе скриншоты занимают экран |
| S34 | Теги `#tag` | Инлайн-теги в тексте | Obs, Bear, Log, iA, Jop | **Could** | Нужно только при библиотеке |
| S35 | Page breaks / Marp front matter | `+++` или `marp: true` для слайдов | iA, Marp, MDH | **Could** | Слайды — отдельный класс продукта |

### 2.5 Файлы и библиотека — 20

| # | Функция | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| F1 | Открыть одиночный файл | Двойной клик из Explorer, без «создайте vault» | Typ, MM, MDH, NP; **не так в Obs/Log** | **Must** | Барьер входа №1 у конкурентов |
| F2 | Открыть папку как workspace | Папка = библиотека, без импорта и БД | Obs, Typ, Zet, VSC, MDH | **Must** | Модель без lock-in |
| F3 | Дерево файлов | Свёртываемый левый рейл с папками | Typ, Obs, Zet, VSC, VN, MDH | **Must** | Заложено в макете |
| F4 | Вкладки | Несколько документов в одном окне | Obs, VSC, MDH, Jop; **нет в Typ на Windows** #638 (77 👍) | **Must** | Самая громкая Windows-специфичная жалоба |
| F5 | Split-панели | Два документа рядом | Obs, VSC, Ulys | **Could** | Усложняет окно; после вкладок |
| F6 | Недавние файлы | Список последних, в т.ч. в системном jump list | Typ (Ctrl+Shift+T), MM, VSC | **Must** | Дёшево, каждый день используется |
| F7 | Закреплённые (pinned) | Держать документ в списке принудительно | Jop (#296 — топ-запрос, реализовано), MDH (pin folders) | **Should** | Проверенный спросом сценарий |
| F8 | Создание/переименование/удаление в дереве | Файловые операции не выходя из приложения | Obs, Typ, VSC | **Should** | Иначе постоянные прыжки в Explorer |
| F9 | Rename с обновлением ссылок | Переименовал файл — ссылки на него починились | Obs, VSC (`updateLinksOnFileMove`), marksman rename | **Should** | Главный источник битых ссылок |
| F10 | Move с починкой относительных путей | Перенос документа не ломает `![](./img/…)` | VSC; **боль в Obs** (forum #3579, #4386) | **Should** | Топовая жалоба про картинки |
| F11 | Корзина вместо hard delete | Удаление → системная корзина или `.trash` | Obs, Jop, QON (корзина с сервера Nextcloud) | **Must** | Дешёвая защита от необратимой потери |
| F12 | Теги | Из front matter и/или инлайн `#tag` | Obs, Bear, Jop, iA, Zet, VN | **Could** | Для ридера вторично |
| F13 | Вложенные теги | `#work/project/alpha` | Obs, Bear; просят в Jop #375 | **Could** | Топ-запрос у Joplin, но не наш класс |
| F14 | Backlinks | Кто ссылается на этот документ | Obs, Bear, Foam, Log, DD; просят в Zet #810, Typ #3495, iA | **Could** | PKM-функция; удорожает индекс |
| F15 | Unlinked mentions | Упоминания названия без ссылки | Obs | **Won't** | Дорогой полнотекстовый анализ ради нишевого сценария |
| F16 | Граф связей | Визуализация сети документов | Obs, Log, Zet, Foam, AFF | **Won't** | Демо-фича; ломает минимализм |
| F17 | Attachments по правилу | Куда класть вставленные файлы (шаблон пути) | Obs, VSC (`markdown.copyFiles.destination`) | **Should** | Иначе каталог засоряется |
| F18 | Сетевые/UNC/OneDrive пути | Корректная работа на сетевых дисках и в синк-папках | PT (UNC-логика для картинок) | **Should** | Реальность корпоративного Windows |
| F19 | Сортировка и фильтр дерева | По имени/дате/размеру, скрытие не-.md | Obs, VSC | **Should** | Дешёво, ежедневно |
| F20 | Избранное / закладки | Быстрый доступ к набору документов | Jop, QON, Zet | **Could** | Дублирует «недавние» + «закреплённые» |

### 2.6 Навигация — 12

| # | Функция | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| N1 | Outline-панель | Дерево заголовков документа | Typ (Ctrl+Shift+1), Obs, GW (Ctrl+J), VSC, iA, Zet | **Must** | Тот же элемент, что TOC-сайдбар |
| N2 | Command palette | Ctrl+P/Ctrl+Shift+P — все команды текстом | Obs, VSC, iA, Ink; **нет в Typ** #6181, **нет в Bear** | **Must** | Позволяет убрать меню и тулбары |
| N3 | Quick switcher | Fuzzy-поиск по именам файлов | Obs (Ctrl+O), Typ (Ctrl+P), Bear (Cmd+O), VSC (Ctrl+P) | **Must** | Заменяет дерево при большой библиотеке |
| N4 | Go to heading в файле | Ctrl+Shift+O — прыжок по заголовкам | VSC, iA (Shift+Cmd+O), Obs | **Should** | Дешёвая надстройка над Outline |
| N5 | Go to symbol в workspace | Ctrl+T — заголовок в любом файле библиотеки | VSC, marksman | **Could** | Требует индекса всей библиотеки |
| N6 | Breadcrumbs | Путь `vault / папка / файл.md` в шапке | VSC; **есть в макете Plain** | **Should** | Уже нарисовано в мокапе |
| N7 | История назад/вперёд | Alt+←/→ по посещённым документам и якорям | Obs, VSC | **Must** | После перехода по ссылке нужен возврат |
| N8 | Минимап | Уменьшенная карта документа справа | VSC, Ntb, PT-Monaco | **Won't** | Визуальный шум, чужой класс |
| N9 | Ctrl+Click по ссылке | Переход по внутренней ссылке | Obs, VSC | **Must** | Иначе wikilinks бессмысленны |
| N10 | Открыть ссылку в новой вкладке | Ctrl+Shift+Click / средняя кнопка | Obs, VSC | **Should** | Не терять текущий контекст |
| N11 | Jump to line | Ctrl+G — переход к строке исходника | VSC | **Could** | Только для режима Edit |
| N12 | Follow-link из превью в исходник | Двойной клик по превью ставит курсор в это место | VSC (`doubleClickToSwitchToEditor`) | **Should** | Связывает Read и Edit |

### 2.7 Поиск и замена — 12

| # | Функция | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| Q1 | Поиск в документе | Ctrl+F в Read и в Edit одинаково | все | **Must** | Базовое ожидание |
| Q2 | Замена в документе | Ctrl+H, «заменить всё» | Typ, Obs, VSC | **Must** | Минимум для редактора |
| Q3 | Regex | Регулярные выражения в поиске и замене | Typ, VSC, Obs (`/…/` в поиске) | **Should** | Явно просят в Obsidian (forum #75494) |
| Q4 | Учёт регистра / целые слова | Стандартные модификаторы | все | **Must** | Ожидание |
| Q5 | Поиск по всей библиотеке | Полнотекстовый поиск по папке | Obs (Ctrl+Shift+F), Typ, VSC, Zet | **Must** | Иначе библиотека — просто дерево |
| Q6 | Замена по всей библиотеке | Массовая замена с предпросмотром | VSC; **нет в Obs** (forum #4395, 260+ 👍, с 2020) | **Should** | Крупнейшая незакрытая дыра лидера |
| Q7 | Операторы поиска | `path:`, `file:`, `tag:`, `line:` | Obs, Bear (`@task`, `@today`) | **Could** | Мощно, но требует обучения |
| Q8 | Поиск по именам файлов | Отдельный режим/фильтр | Obs, VSC, Bear | **Should** | Часто ищут файл, а не текст |
| Q9 | Подсветка всех совпадений + счётчик | «3 из 17» и метки на скроллбаре | VSC, Typ | **Should** | Ощутимо ускоряет просмотр |
| Q10 | Инкрементальный поиск | Результаты по мере ввода, без Enter | VSC, Obs | **Should** | Ожидание современного UI |
| Q11 | Сохранённые запросы / смарт-папки | Поиск как виртуальная папка | Ulys (Filters), iA (Smart Folders), Bear | **Could** | Функция библиотеки, не ридера |
| Q12 | Поиск внутри PDF/вложений (OCR) | Индексация приложенных файлов | Bear Pro | **Won't** | Совсем другой класс задач |

### 2.8 Экспорт и импорт — 16

| # | Функция | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| X1 | Экспорт в PDF | Печать отрендеренного документа в PDF | Typ, Obs, MM, MT, Zet, VN, MPE | **Must** | Формат №1 для «отдать наружу» |
| X2 | Контроль разрывов страниц | Явный `+++` или CSS `page-break` | iA, PW; **нет в Obs** (forum #101637, #13107, #27120) | **Should** | Тройной повтор запроса за 5 лет |
| X3 | Корректный CJK/кириллица в PDF | Встроенные шрифтовые фолбэки | **провал Obs** (forum #113392 — китайский пропадает) | **Must** | Иначе экспорт молча теряет текст |
| X4 | Экспорт в HTML (self-contained) | Один .html со встроенными стилями и base64-картинками | MM, MAIO (Print to HTML), MPE, Typ | **Should** | Самый портируемый формат |
| X5 | Экспорт в DOCX | Word-файл со стилями | Typ (Pandoc), iA, Bear, Ulys, Mk2, MPE | **Should** | Требование корпоративной среды |
| X6 | Экспорт в ePub | Книга | Typ, Bear, Ulys, PW, MPE | **Could** | Нишевое, целиком на Pandoc |
| X7 | Экспорт в LaTeX | .tex для научной публикации | Typ, PW, Zet | **Won't** | Академическая ниша, это Zettlr |
| X8 | Экспорт в изображение (PNG) | Картинка документа/фрагмента | Typ, Bear (JPG), Marp | **Could** | Приятно для шаринга |
| X9 | Печать | Системный диалог печати | Typ, MM; **нет в Obs** (forum #54905) | **Should** | Отсутствие вызывает недоумение |
| X10 | Интеграция с Pandoc | Использовать установленный Pandoc для «всего остального» | Zet (профили), PW, Typ (встроен), MPE | **Should** | 73 расширения и десятки форматов бесплатно |
| X11 | Шаблоны/CSS для экспорта | Отдельный стиль печати, не тема редактора | Ulys (Export Styles), Typ, Mk2, MPE | **Should** | Экран и бумага требуют разной типографики |
| X12 | Copy as HTML / Rich Text | Вставить в почту/Word с сохранением вида | Bear, Mk2, MM | **Should** | Частый запрос, реализуется одним clipboard-форматом |
| X13 | Copy as Markdown (plain) | Скопировать исходник из режима чтения | Typ (Ctrl+Shift+C) | **Must** | Ридер обязан отдавать исходник |
| X14 | Импорт DOCX/HTML → markdown | Обратная конвертация | iA (DOCX), PW, Zet (Pandoc) | **Could** | Ценно, но целиком на Pandoc |
| X15 | Импорт Evernote ENEX / других заметочников | Миграция чужой базы | Jop, Obs (плагины) | **Won't** | Мы работаем с файлами, а не с базами |
| X16 | Batch / project export | Экспорт папки одной командой | Zet (project export), Marp CLI | **Could** | Для техписателей; через CLI |

### 2.9 Изображения и медиа — 14

| # | Функция | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| I1 | Paste изображения из буфера | Ctrl+V картинки создаёт файл и ссылку | Typ, MT, Obs, VSC, MM, GW | **Must** | Ключевой сценарий скриншотов |
| I2 | Drag-and-drop файла в документ | Перетащил PNG — получил `![]()` | VSC (`markdown.editor.drop`), GW, Obs | **Must** | Ожидание от desktop-приложения |
| I3 | Автосохранение в assets-папку | Файл кладётся по правилу (`./assets/`, `./<имя>.assets/`) | Typ, Obs, VSC (`copyFiles.destination`) | **Must** | Иначе картинки разбредаются |
| I4 | Относительные пути по умолчанию | Ссылки переживают перенос всей папки | Typ; **боль в Obs** (forum #3579), **нет в MT** #549 | **Must** | Портируемость — заявленная ценность |
| I5 | Шаблон имени вставляемого файла | `screenshot-{date}-{n}.png` настраивается | **отсутствует в VSC** (#183560, 52 👍) | **Should** | Открытая дыра у самого популярного инструмента |
| I6 | Дедупликация вставок | Повторная вставка той же картинки не плодит файл | **нет в Obs** (forum #2342) | **Could** | Требует хеширования; приятно |
| I7 | Ресайз изображения | Синтаксис `\|200x100` и/или ручки мышью | Obs, Typ, Flintmark | **Should** | Скриншоты по умолчанию гигантские |
| I8 | Лайтбокс / просмотр по клику | Клик открывает картинку в полном размере с зумом | ридеры, Obs | **Should** | Часть «reading experience» |
| I9 | SVG | Рендер векторных картинок | все на WebView; PT (preview handler) | **Should** | Диаграммы в документации часто SVG |
| I10 | Видео и аудио | `<video>`/`<audio>` или ссылка на локальный файл | Obs, HD | **Could** | Редко в .md |
| I11 | Встраивание PDF | Показ PDF внутри документа | Obs, VN (PDF-комментарии) | **Won't** | Отдельный тяжёлый рантайм |
| I12 | Встроенный screen capture | Снять область экрана и сразу вставить | MM | **Could** | Отличная фича, но это Snipping Tool |
| I13 | Загрузка на внешний хостинг | PicGo/S3/Imgur вместо локальных файлов | Typ, MM | **Won't** | Сеть и аккаунты против local-first |
| I14 | Очистка неиспользуемых вложений | Найти файлы, на которые никто не ссылается | просят в Log #2637 | **Could** | Полезно, но опасно (риск удаления) |

### 2.10 Внешний вид — 18

| # | Функция | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| A1 | Светлая / тёмная / системная | Три состояния, следование настройке Windows | Typ, Obs, VSC, MDH («follows Windows») | **Must** | Уже заложено в макете |
| A2 | Мгновенное переключение темы | Хоткей/палитра, без перезапуска и мигания | VSC, Obs | **Should** | Заметная мелочь качества |
| A3 | Пользовательские темы через CSS | Подключить свой .css | Obs (snippets), Typ, VSC (`markdown.styles`), Zet, GW | **Could** | Мощно, но открывает поддержку тем |
| A4 | Настройка шрифта прозы | Выбор гарнитуры и начертания | iA, Typ, VSC, DD | **Should** | Типографика — часть позиционирования |
| A5 | Настройка шрифта кода | Отдельная моно-гарнитура для fence | VSC, Typ | **Should** | Даже в моно-дизайне нужен фолбэк |
| A6 | Размер шрифта / zoom контента | Ctrl+= / Ctrl+− / Ctrl+0 | Typ, VSC, MDH | **Must** | Базовая доступность |
| A7 | Ширина колонки текста | Ползунок/пресеты 60–100 символов | iA, Ulys, Obs (`--file-line-width`) | **Must** | Главный рычаг читаемости |
| A8 | Межстрочный интервал | Настройка line-height | VSC (`preview.lineHeight`), Ulys | **Should** | Дёшево, влияет на комфорт |
| A9 | Focus mode | Затемнение всего, кроме текущей строки/абзаца | Typ (F8), iA, GW, Ulys, MT, DD | **Should** | Ожидание для «минималистичного писателя» |
| A10 | Typewriter mode | Каретка зафиксирована по вертикали | Typ (F9), iA, Ulys (Fixed Scrolling), MT, DD; просят в Bear | **Should** | Классика жанра, часто хвалят |
| A11 | Hemingway mode | Backspace/Delete отключены | GW | **Won't** | Забавно, но чужая философия |
| A12 | Zen / скрытие хрома | Спрятать сайдбар, тулбар, статусбар | Typ (Ctrl+Shift+L), Ntb, Ulys (Cmd+.) | **Must** | Прямо следует из «минимализма» |
| A13 | Один акцентный цвет | Каретка, выделение, активный пункт — и всё | заложено в макете Plain | **Must** | Дизайн-решение продукта |
| A14 | Плотность интерфейса | Compact / comfortable | VSC | **Could** | Приятно, добавляет настроек |
| A15 | Windows-нативность (Mica, скругления, тонкий title bar) | Приложение выглядит как часть Windows 11 | заложено в макете; аргумент из PT #45267 | **Should** | Явно противопоставлено «браузерной вкладке» |
| A16 | Отдельная тема для превью/экспорта | Печатная тема ≠ экранная | Ulys, Mk2, Typ | **Should** | Экспорт не должен наследовать тёмную тему |
| A17 | Настройка отображения front matter | Скрыть / таблица / код | VSC 1.121 | **Should** | Три режима, минимум споров |
| A18 | Иконки только там, где иконка — это подпись | Отказ от тулбар-иконок | заложено в макете Plain | **Should** | Дизайн-контракт продукта |

### 2.11 Производительность — 12

| # | Функция | Описание | Где есть / антипример | Оценка | Обоснование |
|---|---|---|---|---|---|
| P1 | Быстрый холодный старт | Цель <500 мс до первого кадра | MDH (Tauri ~8 МБ); Tauri ~380 мс против Electron ~1420 мс | **Must** | Причина, по которой не берут VS Code |
| P2 | Низкое потребление RAM | Цель <150 МБ на документ | Tauri ~40–80 МБ против Electron ~150–400 МБ | **Must** | «Electron bloat» — постоянная претензия |
| P3 | Малый дистрибутив | Единицы, а не сотни мегабайт | MDH ~8 МБ | **Should** | Аргумент установки «ради одного файла» |
| P4 | Виртуализация длинного документа | Рендерить только видимую область + запас | CodeMirror 6 (viewport rendering + карта высот) | **Must** | Без этого длинные файлы не жить |
| P5 | Инкрементальный парсинг | Перепарсивать только изменённый диапазон | CodeMirror 6, tree-sitter (Zed) | **Must** | Отзывчивость ввода |
| P6 | Ленивый рендер диаграмм и картинок | Mermaid/изображения считаются при попадании во вьюпорт | VSC (баг мерцания Mermaid #316977) | **Should** | Диаграммы — главный тормоз рендера |
| P7 | Открытие файлов ≥10 МБ | Не падать и не вешать ОС | **провалы Typ**: 4 МБ не открывается (#6290), фриз ОС (#4762), обрезка текста (#6620); **MT** зависает на 300k слов (#4887) | **Must** | Прямая дифференциация от лидеров |
| P8 | Отзывчивость ввода на больших файлах | Задержка символа <16 мс на 100k слов | **провал Typ** (лаги от 10k слов, #6542) | **Must** | Наиболее осязаемое отличие |
| P9 | Фоновая индексация библиотеки | Индекс строится не блокируя UI | Obs; **провал Log** (4 мин на 2 000 страниц) | **Should** | Иначе большая папка = зависание |
| P10 | Отсутствие плагинного налога на старт | Нет системы плагинов — нет её цены | **антипример Obs** (плагины добавляют до минуты) | **Must** | Прямое следствие отказа от плагинов |
| P11 | Кэш рендера между открытиями | Повторное открытие мгновенно | — | **Could** | Оптимизация после замеров |
| P12 | Плавная прокрутка 60+ FPS | Скролл длинного документа без рывков | GW («оптимизирован под большие документы») | **Should** | Ощущение качества |

### 2.12 Надёжность — 16

| # | Функция | Описание | Где есть / антипример | Оценка | Обоснование |
|---|---|---|---|---|---|
| D1 | Автосохранение | Сохранение по таймеру/потере фокуса | Obs (~2 c), Typ (5 мин), GW, iA | **Should** | Обязательно с явным индикатором |
| D2 | Явное Ctrl+S + индикатор dirty | Точка/звёздочка на вкладке | VSC, MM, MDH | **Must** | Пользователь должен знать состояние файла |
| D3 | Обнаружение внешних изменений | Watcher на открытые файлы и папку | Mk2; **провал MT** #656/#2168, **баг VSC** #265277, **дыра Obs** (forum #174) | **Must** | Сегодня файлы правят и AI-агенты |
| D4 | Авто-reload без правок | Если документ не изменён локально — просто перечитать | Mk2 | **Must** | Ридер обязан показывать актуальное |
| D5 | Диалог конфликта | Есть локальные правки + внешние → выбор/дифф | просят в MT #2168 | **Must** | Единственная защита от тихой потери |
| D6 | Локальная история версий | Снимки файла с возможностью отката | Obs File Recovery (5 мин / 7 дней); **нет в Bear** (28+ 👍), **нет в Jop** (#15246), **нет в Typ на Windows** | **Should** | Регулярно приводит к необратимым потерям у конкурентов |
| D7 | Резервные копии по расписанию | Часовые/дневные/недельные снимки | Ulys (12 ч / 7 дн / 6 мес) | **Could** | Дублирует D6 при аккуратной реализации |
| D8 | Восстановление после краха | Несохранённые черновики после падения | Typ («Recover Unsaved Drafts») | **Should** | Ожидание, дёшево |
| D9 | Атомарная запись файла | temp-файл + rename, никогда не truncate-in-place | — | **Must** | Защита от потери при сбое питания/сети |
| D10 | Сохранение кодировки, BOM и EOL | UTF-8/UTF-16, CRLF/LF как в исходнике | — | **Must** | Windows + git: иначе diff в 100 % строк |
| D11 | Нулевое переформатирование | Сохраняются только реально отредактированные байты | **провал MT** #2189 | **Must** | Ключ доверия к WYSIWYG-режиму |
| D12 | Удаление в корзину | Восстановимо средствами ОС | Obs, Jop | **Must** | Одна строка кода против катастрофы |
| D13 | Режим только чтение | Явная блокировка правок для чужих/системных файлов | — | **Should** | Соответствует поверхности Read |
| D14 | Корректная работа с read-only и правами | Понятная ошибка вместо тихого несохранения | — | **Must** | Корпоративные шары и OneDrive |
| D15 | Safe mode / журнал ошибок | Запуск без настроек и тем, лог для баг-репорта | Obs (safe mode) | **Could** | Нужно, если появятся темы/скрипты |
| D16 | Обработка «файл удалён/переименован извне» | Вкладка не падает, предлагает сохранить копию | — | **Should** | Частый сценарий с git-ветками |

### 2.13 Интеграции и системная интеграция Windows — 20

| # | Функция | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| G1 | Ассоциация `.md` / `.markdown` | Регистрация ProgID, появление в «Открыть с помощью» и «Приложения по умолчанию» | MDH, Typ, MM | **Must** | Сценарий «двойной клик» — вся суть продукта |
| G2 | Поддержка родственных расширений | `.mdx`, `.mdown`, `.mkd`, `.txt` (опционально) | VSC | **Should** | Дёшево, снимает вопросы |
| G3 | Пункт контекстного меню Explorer | «Открыть в Plain» без смены дефолта | MM (shell integration) | **Should** | Не отбирая ассоциацию у VS Code |
| G4 | Иконка файла для `.md` | Своя иконка вместо белого листа | — | **Should** | Визуальная идентификация в Explorer |
| G5 | Thumbnail-хендлер для `.md` | Превью-миниатюра в Explorer | **нет ни у кого** (PowerToys даёт только preview pane) | **Could** | Незанятая ниша, но нетривиально |
| G6 | Preview handler для панели предпросмотра | Рендер в правой панели Explorer | PT (Markdown previewer) | **Could** | PowerToys уже закрывает; дублировать спорно |
| G7 | CLI | `plain file.md`, `plain --export pdf` | Obs CLI, MM, Marp CLI, Bear CLI, Pandoc | **Should** | Скрипты и вызов из других инструментов |
| G8 | URI-схема | `plain://open?path=…` | Obs (`obsidian://`), Bear/Ulys (x-callback-url), iA (URL Commands) | **Could** | Нужно для автоматизации, не для v1 |
| G9 | Jump list в панели задач | Недавние документы по правому клику на иконке | — | **Should** | Дешёвая Windows-нативность |
| G10 | Один процесс на несколько окон | Второй файл открывается в существующем процессе | **просят в Jop** #591 | **Should** | Иначе N окон = N × RAM |
| G11 | Несколько независимых окон | Два документа рядом на разных мониторах | Obs, VSC; **просят в PT** #45267 (multi-instance) | **Should** | Прямо перечислено в запросе на Markdown Reader |
| G12 | Always on top | Держать окно поверх других | **просят в PT** #45267 | **Should** | Сценарий «читаю инструкцию, делаю рядом» |
| G13 | Портативный режим | Запуск без установки, настройки рядом с exe | MM, Zet (частично) | **Could** | Ценят на рабочих машинах без прав |
| G14 | Дистрибуция через winget / MSIX / Store | Установка одной командой, автообновление | MDH, VSC | **Should** | Ожидание 2026 года на Windows |
| G15 | Автообновление | Тихое обновление с changelog | Obs, VSC; **просят в Jop** #8958 | **Should** | Иначе половина юзеров на старой версии |
| G16 | Git-интеграция | Статус файла, коммит, история | MM (deep git), просят в Zet #1050 и Typ #3196 | **Could** | Мощно, но это уже IDE |
| G17 | Синхронизация | Собственный облачный sync | Obs Sync, Jop, Ink, Bear | **Won't** | Источник большинства инцидентов потери данных |
| G18 | Плагины/расширения | Сторонний код внутри приложения | Obs (7 281), Ink, Jop, VSC | **Won't** | Плагины = вес старта, баги, дыры безопасности |
| G19 | Language server (marksman) | Внешний LSP для wikilinks/rename/диагностик | Hlx (по умолчанию), Zed, VSC, Neovim | **Could** | Способ получить умные ссылки без своего индексатора |
| G20 | AI / MCP-интеграция | Ассистент внутри редактора | Bear (MCP), NP (Write/Rewrite/Summarize), AFF, Ink | **Won't** | Прямо противоречит минимализму и офлайну |

### 2.14 Доступность и локализация — 12

| # | Функция | Описание | Где есть / антипример | Оценка | Обоснование |
|---|---|---|---|---|---|
| C1 | Поддержка скринридеров (NVDA/JAWS) | Документ и UI читаются вслух корректно | **провал Obs**: forum #103245, #84377, #64881, #58020 | **Should** | Огромная незакрытая дыра во всей категории |
| C2 | ARIA-роли и подписи всех кнопок | Ни одной иконки без доступного имени | **провал Obs** (forum #71444) | **Must** | Дёшево на этапе разработки, дорого потом |
| C3 | Полная навигация с клавиатуры | Любая команда достижима без мыши | VSC, Obs | **Must** | Следствие ставки на command palette |
| C4 | Видимый фокус-ринг | Понятно, где фокус, при Tab-навигации | VSC | **Must** | Требование доступности и удобства |
| C5 | Настраиваемые хоткеи | Переназначение любой команды | Obs, VSC; **нет в Zet** (#818) | **Should** | Частый запрос, дёшево при палитре команд |
| C6 | Высококонтрастная тема | Поддержка Windows High Contrast | DD, VSC | **Should** | Требование корпоративной закупки |
| C7 | Уважение системных настроек | Reduce motion, размер текста, тема | — | **Should** | Нативность = следование системе |
| C8 | Масштабирование DPI и мультимонитор | Корректный размер окна при 100 %/150 % на разных экранах | **провал Obs** (forum #66614, баг Electron) | **Must** | Массовая конфигурация ноут + монитор |
| C9 | Локализация UI | Минимум EN + RU, механизм для остальных | Jop, QON (11+ языков), VN; **просили в MT** #138 | **Should** | Дешёво при аккуратной архитектуре |
| C10 | RTL | Арабский/иврит в тексте и UI | **просят в Jop** #3991 | **Could** | Существенная работа ради небольшой аудитории |
| C11 | IME и CJK-ввод | Композиция иероглифов не ломает редактор | известная проблема Electron-редакторов | **Should** | Иначе весь CJK-рынок недоступен |
| C12 | Шрифтовые фолбэки CJK и эмодзи | Нет «квадратиков» ни на экране, ни в PDF | **провал Obs** (forum #113392) | **Must** | Связано с X3 |

### 2.15 Горячие клавиши — сводка по 6 продуктам

Все комбинации — Windows/Linux, кроме iA Writer (только macOS-раскладка задокументирована).

| Действие | Typora | VS Code (+MAIO) | Obsidian | Ghostwriter | MDHero | iA Writer (Mac) |
|---|---|---|---|---|---|---|
| Открыть файл | Ctrl+O | Ctrl+O | — | — | — | — |
| Быстрое открытие (fuzzy) | Ctrl+P | Ctrl+P | Ctrl+O | — | — | Shift+Cmd+O |
| Палитра команд | — (#6181) | Ctrl+Shift+P | Ctrl+P | — | — | Shift+Cmd+P |
| Сохранить | Ctrl+S | Ctrl+S | авто | авто | Ctrl+S | авто |
| Жирный | Ctrl+B | Ctrl+B | Ctrl+B | — | — | Cmd+B |
| Курсив | Ctrl+I | Ctrl+I | Ctrl+I | — | — | Cmd+I |
| Зачёркнутый | Alt+Shift+5 | Alt+S | — | — | — | — |
| Ссылка | Ctrl+K | — | — | — | — | Shift+Cmd+K (wikilink) |
| Заголовок 1–6 | Ctrl+1…6 | Ctrl+Shift+] / [ (сдвиг уровня) | — | — | — | — |
| Код инлайн | Ctrl+Shift+` | — | — | — | — | — |
| Блок кода | Ctrl+Shift+K | — | — | — | — | — |
| Блок формулы | Ctrl+Shift+M | Ctrl+M (MAIO) | — | — | — | — |
| Цитата | Ctrl+Shift+Q | — | — | — | — | — |
| Список маркированный | Ctrl+Shift+] | — | — | — | — | — |
| Список нумерованный | Ctrl+Shift+[ | — | — | — | — | — |
| Отступ / выступ | Ctrl+[ / Ctrl+] (Tab/Shift+Tab) | Tab / Shift+Tab | Tab / Shift+Tab | — | — | — |
| Задача вкл/выкл | — | Alt+C (MAIO) | — | — | — | — |
| Таблица | Ctrl+T | — | — | — | — | — |
| Найти | Ctrl+F | Ctrl+F | Ctrl+F | — | Ctrl+F | Cmd+F |
| Заменить | Ctrl+H | Ctrl+H | Ctrl+H | — | — | — |
| Поиск по библиотеке | — | Ctrl+Shift+F | Ctrl+Shift+F | — | — | — |
| Переключить Source/Preview | Ctrl+/ | Ctrl+Shift+V | Ctrl+E | — | Ctrl+E | Cmd+R |
| Превью сбоку | — | Ctrl+K V | — | — | — | — |
| Аутлайн / TOC | Ctrl+Shift+1 | Ctrl+Shift+O | — | Ctrl+J | — | Shift+Cmd+O |
| Сайдбар вкл/выкл | Ctrl+Shift+L | Ctrl+B | — | — | — | Ctrl+Cmd+S |
| Дерево файлов | Ctrl+Shift+3 | — | — | — | — | — |
| Новая вкладка | — | Ctrl+N | — | — | Ctrl+T | — |
| Переключение документов | Ctrl+Tab | Ctrl+Tab | Ctrl+Tab | — | — | — |
| Вернуть закрытый файл | Ctrl+Shift+T | Ctrl+Shift+T | — | — | — | — |
| Focus mode | F8 | — | — | есть | — | Cmd+D |
| Typewriter mode | F9 | — | — | — | — | — |
| Полный экран | F11 | F11 | F11 | F11 | — | — |
| Масштаб + / − / 100 % | Ctrl+Shift+= / − / 0 | Ctrl+= / − / 0 | — | — | — | — |
| Вставить как простой текст | Ctrl+Shift+V | Ctrl+Shift+V | Ctrl+Shift+V | — | — | — |
| Копировать как Markdown | Ctrl+Shift+C | — | — | — | — | — |
| Настройки | Ctrl+, | Ctrl+, | Ctrl+, | — | — | — |

**Выводы для «Plain»:**
1. Консенсус, который нельзя нарушать: `Ctrl+O` открыть, `Ctrl+S` сохранить, `Ctrl+F`/`Ctrl+H` поиск/замена, `Ctrl+B`/`Ctrl+I`, `Ctrl+P` быстрое открытие, `Ctrl+Shift+P` палитра, `Ctrl+Tab` вкладки, `Ctrl+Shift+T` вернуть закрытую, `F11` полный экран, `Ctrl+,` настройки.
2. Конфликт: `Ctrl+P` = «быстрое открытие» (VS Code, Typora) против «палитра команд» (Obsidian). Берём модель VS Code (она распространённее): `Ctrl+P` — файлы, `Ctrl+Shift+P` — команды.
3. Три поверхности логично вешать на `Ctrl+1` (Read) / `Ctrl+2` (Edit) / `Ctrl+3` (Rich) — это не конфликтует с Typora только потому, что у нас нет `Ctrl+1..6` для заголовков; альтернатива — `Ctrl+E` циклом (Obsidian/MDHero).
4. `F8`/`F9` под Focus/Typewriter — свободные и уже узнаваемые по Typora.

### 2.16 Мелочи, которые пользователи ценят (quality of life) — 20

| # | Функция | Описание | Где есть | Оценка | Обоснование |
|---|---|---|---|---|---|
| L1 | Reveal in Explorer | Показать текущий файл в проводнике | Obs, VSC, MM | **Must** | Названо среди самых используемых команд |
| L2 | Copy file path / Copy as link | Скопировать абсолютный или относительный путь | VSC | **Should** | Ежедневная мелочь |
| L3 | Открыть во внешнем редакторе | Отдать файл в VS Code/Notepad одной командой | Typ (VS Code extension), Obs | **Should** | Признание, что мы не всё умеем |
| L4 | Восстановление сессии | Вкладки, сплиты и позиции после перезапуска | **просят в Typ** #6517, **в Obs** forum #83575 | **Must** | Двойной запрос в двух разных продуктах |
| L5 | Запоминание позиции курсора и скролла | Возврат ровно туда, где закончил | **запрос Obs** forum #962 (породил плагин) | **Must** | Один из самых частых запросов категории |
| L6 | Undo close tab | Ctrl+Shift+T | Typ, VSC | **Should** | Мышечная память из браузера |
| L7 | Drag файла в окно | Перетащил .md на окно — открылся | все десктопные | **Must** | Ожидание от desktop-приложения |
| L8 | Drag файла на иконку в панели задач | Открытие из Explorer без ассоциации | Windows shell | **Could** | Дешёвая мелочь |
| L9 | Paste as plain text | Ctrl+Shift+V без форматирования | Typ, Obs, VSC | **Must** | Иначе вставка из браузера мусорит |
| L10 | Умная вставка HTML → markdown | Скопировал из браузера — получил markdown | Obs, MM | **Should** | Экономит минуты на каждой заметке |
| L11 | Word count в статусбаре | Слова/символы/строки, обновляется по выделению | Typ, GW, Mk2 | **Should** | Тихо, но полезно |
| L12 | Индикатор несохранённого | Точка на вкладке, изменение заголовка окна | VSC, MM | **Must** | Связано с D2 |
| L13 | Автоопределение кодировки | UTF-8/UTF-16/CP1251 без «кракозябр» | — | **Must** | Windows-реальность |
| L14 | Показ невидимых символов | Пробелы/табы/EOL по требованию | VSC | **Could** | Для отладки markdown |
| L15 | Размер и дата файла в статусбаре | Метаданные без похода в Explorer | — | **Could** | Дёшево |
| L16 | Уведомление, когда открыт большой файл | «Файл 12 МБ, часть функций отключена» | — | **Should** | Честнее, чем зависнуть |
| L17 | Переход по ссылке из превью в исходник | Двойной клик в Read ставит курсор в Edit | VSC | **Should** | Связывает поверхности |
| L18 | Быстрый снимок в буфер как картинка | Скопировать фрагмент документа изображением | Marp/Typ (экспорт PNG) | **Could** | Для мессенджеров |
| L19 | «Открыть последний документ при запуске» | Опция стартового поведения | Typ, VSC | **Should** | Пары кликов меньше каждый день |
| L20 | Понятный пустой экран | Что делать, когда ничего не открыто: недавние + «открыть папку» | VSC | **Should** | Первое впечатление |

**Итого пунктов в инвентаризации: 24 + 24 + 14 + 35 + 20 + 12 + 12 + 16 + 14 + 18 + 12 + 16 + 20 + 12 + 20 = 269.**

---

## 3. Чего пользователи чаще всего просят и на что жалуются

Отсортировано по силе сигнала (число реакций, повторяемость запроса в разных продуктах, тяжесть последствий).

| # | Проблема | Суть | Продукты | Источник |
|---|---|---|---|---|
| 1 | **Нет лёгкого read-only ридера для Windows** | «Windows lacks a native, lightweight, read-only application for sustained reading of Markdown files»; Peek исчезает при потере фокуса, VS Code тяжёл, браузер не даёт OS-интеграции. Просят: постоянное окно, TOC-сайдбар, Mermaid, GFM+таблицы, Ctrl+F, зум, Always on Top, Snap Layouts, multi-instance, контекстное меню Explorer | Windows в целом | [PowerToys #45267](https://github.com/microsoft/PowerToys/issues/45267) |
| 2 | **Нет вкладок на Windows/Linux** | В macOS вкладки есть (через OS), на Windows — нет; открыт ~9 лет | Typora | [#638](https://github.com/typora/typora-issues/issues/638) (77 👍), [#1000](https://github.com/typora/typora-issues/issues/1000) (70 👍) |
| 3 | **Редактор молча переписывает файл** | При открытии/сохранении удаляются пустые строки, меняются маркеры списков, перенумеровываются пункты, переезжают сноски — потому что документ хранится как внутренняя блочная структура, а не как текст | MarkText | [#2189](https://github.com/marktext/marktext/issues/2189) |
| 4 | **Нет поиска-замены по всей библиотеке** | «Imagine selling a CRM without the ability to make a quick change… on a 50 or 500-item found set»; открыт с 2020 | Obsidian | [forum #4395](https://forum.obsidian.md/t/global-mass-vault-wise-search-replace/4395), regex-версия [#75494](https://forum.obsidian.md/t/75494) |
| 5 | **Приложение падает или вешает ОС на большом файле** | 4 МБ не открывается; фриз всей системы; молчаливое обрезание текста на 180–220k слов; MarkText зависает на 300k слов (Obsidian тот же файл открывает за секунды) | Typora, MarkText | [Typ #6290](https://github.com/typora/typora-issues/issues/6290), [#4762](https://github.com/typora/typora-issues/issues/4762), [#6620](https://github.com/typora/typora-issues/issues/6620), [MT #4887](https://github.com/marktext/marktext/issues/4887) |
| 6 | **Лаги ввода на длинных документах** | Заметное подтормаживание с ~10 000 слов, near-freeze на 20 000 | Typora | [#6542](https://github.com/typora/typora-issues/issues/6542) |
| 7 | **Внешние изменения файла не подхватываются** | Правка в другом редакторе (или AI-агентом) не видна; превью показывает старую версию; нет диалога конфликта | MarkText, VS Code, Obsidian | [MT #656](https://github.com/marktext/marktext/issues/656), [MT #2168](https://github.com/marktext/marktext/issues/2168), [VSC #265277](https://github.com/microsoft/vscode/issues/265277), [Obs forum #174](https://forum.obsidian.md/t/expand-the-file-watcher-capability-to-the-whole-vault-instead-of-just-the-root/174) |
| 8 | **Перемещение файлов и картинок ломает ссылки** | Перенёс вложения — заметки их «отцепили»; относительные пути ломаются «(critical!)»; нет массового переноса 500 картинок без разрушения ссылок | Obsidian | [#25388](https://forum.obsidian.md/t/i-moved-my-attachments-from-folder-a-to-folder-b-then-when-i-open-my-note-which-contains-the-image-or-file-was-in-folder-a-after-i-moved-them-to-b-the-note-unlinks-them/25388), [#3579](https://forum.obsidian.md/t/relative-image-and-attachment-paths-get-broken-critical/3579), [#28477](https://forum.obsidian.md/t/how-to-move-500-pasted-images-to-a-folder-without-breaking-links/28477) |
| 9 | **PDF-экспорт без контроля разрывов страниц** | Запрос повторяется в трёх отдельных тредах с 2021 года | Obsidian | [#101637](https://forum.obsidian.md/t/page-breaks-for-pdf-again/101637), [#13107](https://forum.obsidian.md/t/page-breaks-for-pdfs/13107), [#27120](https://forum.obsidian.md/t/ability-to-choose-where-page-breaks-in-pdf/27120) |
| 10 | **PDF молча теряет CJK и подменяет шрифты** | Китайские иероглифы исчезают, если не задать CJK-шрифт принудительно; шрифт подменяется без предупреждения; Mermaid вылезает за границу страницы | Obsidian | [#113392](https://forum.obsidian.md/t/113392), [#55383](https://forum.obsidian.md/t/pdf-export-changed-fonts-on-me/55383), [#13381](https://forum.obsidian.md/t/13381) |
| 11 | **Нет команды «Печать»** | «Every plain text editor I have ever used includes a Print command… this lack of support has always surprised me» (тред на 50 сообщений) | Obsidian | [#54905](https://forum.obsidian.md/t/add-printing-capability-electron-has-the-api/54905) |
| 12 | **Синхронизация теряет данные** | Sync плодит conflict-файлы без реальных правок; дублирует куски файлов; молча сливает без уведомления; в Joplin — удаление старой версии вместо конфликта, потеря при сохранении из внешнего редактора, «нет истории → необратимая потеря» | Obsidian, Joplin | [Obs #108029](https://forum.obsidian.md/t/108029), [#94732](https://forum.obsidian.md/t/94732), [#14943](https://forum.obsidian.md/t/14943), [Jop #13531](https://github.com/laurent22/joplin/issues/13531), [#14954](https://github.com/laurent22/joplin/issues/14954), [#15246](https://github.com/laurent22/joplin/issues/15246) |
| 13 | **Windows ломает облачный sync системными файлами** | `desktop.ini`, создаваемый Windows внутри `.lock`, полностью ломает синхронизацию через Google Drive и появляется снова | Joplin | [#3381](https://github.com/laurent22/joplin/issues/3381) |
| 14 | **Нет истории версий заметок** | Топ-запрос с 28+ голосами, реальные сообщения о потере данных с 2023 года | Bear | [community #12381](https://community.bear.app/t/note-revision-history/12381) |
| 15 | **Медленный старт из-за плагинов** | Тяжёлые vault'ы стартуют до минуты; сообщество написало Lazy Plugin Loader как обходной путь | Obsidian | [tfthacker](https://tfthacker.substack.com/p/improve-obsidian-startup-time-on-older-devices-with-the-faststart-script-70a6c590309f) |
| 16 | **Плагин ломается обновлением ядра** | Vim-режим перестал работать после апдейта 0.13.25/26 | Obsidian | [#32743](https://forum.obsidian.md/t/vim-broken-in-latest-update-0-13-25-26/32743) |
| 17 | **Деградация при росте базы** | 2 000 страниц открываются 4 мин (SSD) и 10+ мин (HDD); expand/collapse — 10+ с; запросы вешают приложение | Logseq | [discuss #1484](https://discuss.logseq.com/t/very-slow-performance-with-large-local-graph/1484), [#22314](https://discuss.logseq.com/t/logseq-performance-very-bad-as-graph-grows/22314) |
| 18 | **Устаревший Electron как угроза безопасности** | Приложение долго поставлялось с EOL-версией Electron | Logseq | [#11378](https://github.com/logseq/logseq/issues/11378), [#11644](https://github.com/logseq/logseq/issues/11644) |
| 19 | **Битые скринридеры** | Ссылки и embed'ы обрывают чтение; JAWS не видит Quick Switcher и палитру команд; «blank» вместо текста; озвучка знаков препинания вместо слов | Obsidian | [#103245](https://forum.obsidian.md/t/103245), [#84377](https://forum.obsidian.md/t/84377), [#64881](https://forum.obsidian.md/t/64881), [#58020](https://forum.obsidian.md/t/58020) |
| 20 | **Окно ломается на мультимониторе с разным DPI** | При 150 % на основном и 100 % на втором окно резко уменьшается при перезапуске (баг Electron) | Obsidian | [#66614](https://forum.obsidian.md/t/windows-wrong-window-size-when-re-opening-obsidian-multiple-monitors-with-different-scaling-dpi/66614) |
| 21 | **Не восстанавливается сессия** | Вкладки, сплиты и позиция прокрутки теряются при перезапуске или падении | Obsidian, Typora | [Obs #83575](https://forum.obsidian.md/t/persistent-editor-view-state-on-restart/83575), [Typ #6517](https://github.com/typora/typora-issues/issues/6517) |
| 22 | **Не запоминается позиция в документе** | Каждое открытие — снова с начала (20 сообщений, породило популярный плагин) | Obsidian | [#962](https://forum.obsidian.md/t/remember-restore-document-position-scroll-position-cursor-note-position/962) |
| 23 | **Нет визуального редактора таблиц** | Открыт с 2016; пользователи платят $18 за сторонний TableFlip | Typora | [#344](https://github.com/typora/typora-issues/issues/344) |
| 24 | **Форматтер таблиц ломается на юникоде** | Emoji, комбинирующие символы и не-BMP разъезжают колонки | Markdown All in One | [#151](https://github.com/yzhang-gh/vscode-markdown/issues/151) |
| 25 | **Лаги Enter/Backspace в списках** | Особенно вместе с проверкой орфографии | Markdown All in One | [#855](https://github.com/yzhang-gh/vscode-markdown/issues/855), [#423](https://github.com/yzhang-gh/vscode-markdown/issues/423) |
| 26 | **Outline показывает решётки** | В аутлайне видны литеральные `#`; самая залайканная markdown-задача VS Code, открыта с 2018 | VS Code | [#53992](https://github.com/microsoft/vscode/issues/53992) (109 👍) |
| 27 | **Превью не открывается автоматически** | Нужна опция «открывать превью при открытии .md» | VS Code | [#2766](https://github.com/microsoft/vscode/issues/2766) (90 👍) |
| 28 | **Word wrap не понимает markdown** | Перенос не учитывает структуру списков и отступов | VS Code | [#164267](https://github.com/microsoft/vscode/issues/164267) (65 👍) |
| 29 | **Нет шаблона имени вставляемой картинки** | Все вставки называются одинаково, папка захламляется | VS Code | [#183560](https://github.com/microsoft/vscode/issues/183560) (52 👍) |
| 30 | **Нет нативных GitHub Alerts** | `> [!NOTE]` не рендерится без расширения | VS Code | [#209652](https://github.com/microsoft/vscode/issues/209652) (47 👍) |
| 31 | **Нет math/LaTeX в превью; нет callouts, footnotes, emoji** | Многолетний тред о разрыве превью Zed с VS Code/Typora; нет PDF-экспорта | Zed | [#40813](https://github.com/zed-industries/zed/issues/40813), [discussion #23951](https://github.com/zed-industries/zed/discussions/23951), [#32137](https://github.com/zed-industries/zed/discussions/32137) |
| 32 | **Диаграммы Mermaid рендерятся с ошибками** | Плохая раскладка subgraph, не рендерится sequenceDiagram, теряются кратности в erDiagram; в VS Code — мерцание блока при открытии | Zed, VS Code | [Zed #56160](https://github.com/zed-industries/zed/issues/56160), [#57775](https://github.com/zed-industries/zed/issues/57775), [VSC #316977](https://github.com/microsoft/vscode/issues/316977) |
| 33 | **Lock-in под видом «plain markdown»** | «Are we moving away from portability?» — Dataview, block-links и вложенные YAML-теги делают vault непереносимым в VS Code; properties используют непортируемые wikilinks | Obsidian | [#19329](https://forum.obsidian.md/t/are-we-moving-away-from-portability-how-much-is-obsidian-locking-our-notes-in/19329), [#63825](https://forum.obsidian.md/t/63825) |
| 34 | **Проприетарный формат и read-only при отмене подписки** | «Если перестаёшь платить, Ulysses переходит в режим только чтения» | Ulysses | [QuillSpace review](https://quillspace.app/blog/ulysses-app-review) |
| 35 | **Усталость от подписок и посплатформенных цен** | Sync и Publish — две отдельные подписки; $50 за платформу назвали «silly price»; переход Ulysses на подписку в 2017 до сих пор обсуждается | Obsidian, iA Writer, Ulysses | [Obs #20162](https://forum.obsidian.md/t/20162), [HN 38571088](https://news.ycombinator.com/item?id=38571088), [TechCrunch](https://techcrunch.com/2017/08/11/popular-writing-app-ulysses-switches-to-subscription-model/) |
| 36 | **Нет folding и word-wrap в код-блоках** | Нельзя свернуть раздел; длинные строки кода уезжают за экран | MarkText | [#1869](https://github.com/marktext/marktext/issues/1869), [#2496](https://github.com/marktext/marktext/issues/2496) |
| 37 | **Нет относительной папки для картинок** | Вставленные изображения нельзя положить рядом с документом | MarkText | [#549](https://github.com/marktext/marktext/issues/549) |
| 38 | **Нет кнопки «копировать код»** | Долгий запрос в трекере | Joplin | [#2383](https://github.com/laurent22/joplin/issues/2383) |
| 39 | **Нельзя запустить несколько экземпляров** | Два документа рядом требуют второго процесса | Joplin | [#591](https://github.com/laurent22/joplin/issues/591) |
| 40 | **Нет автообновления** | Приходится качать инсталлятор руками | Joplin | [#8958](https://github.com/laurent22/joplin/issues/8958) |
| 41 | **Нет кастомных хоткеев / backlinks / git** | Три отдельных многолетних запроса | Zettlr | [#818](https://github.com/Zettlr/Zettlr/issues/818), [#810](https://github.com/Zettlr/Zettlr/issues/810), [#1050](https://github.com/Zettlr/Zettlr/issues/1050) |
| 42 | **Рендеринг шрифта хуже нативного** | Претензии к сглаживанию/ClearType в Electron-редакторах | VS Code | [#239038](https://github.com/microsoft/vscode/issues/239038) |
| 43 | **Плагины без песочницы** | Плагины имеют неограниченный доступ к ФС и сети — признано самим вендором | Obsidian | [Plugin security docs](https://obsidian.md/help/plugin-security) |
| 44 | **Изменённая картинка не перерисовывается в превью** | Нужно вручную обновлять превью после правки файла изображения | VS Code | [#65258](https://github.com/microsoft/vscode/issues/65258) |
| 45 | **AI-редакторы markdown умирают** | Reor архивирован 2026-03-07; Kuku — только macOS. Ставка на AI-фичи не спасает продукт | Reor, Kuku | [Reor repo](https://github.com/reorproject/reor) |
| 46 | **Нет поиска-замены по всем заметкам** | Топ-1 запрос трекера (168 👍) в продукте, который так и не дожил до реализации | Notable | [#140](https://github.com/notable/notable/issues/140) |
| 47 | **Нет истории версий** | 136 👍 / 103 комментария; проект остановился, не реализовав | Notable | [#116](https://github.com/notable/notable/issues/116) |
| 48 | **Проект закрывает исходники на середине жизни** | «Проект без открытого кода — особенно от одиночного разработчика — это большой красный флаг» | Notable, Markdown Monster | [#1759](https://github.com/notable/notable/issues/1759), [MM LICENSE](https://github.com/RickStrahl/MarkdownMonster/blob/main/LICENSE.md) |
| 49 | **Windows-сборка отстаёт от Linux на годы** | Linux получает релизы ежемесячно, свежая портативная сборка для Windows — 2022 года, установщика нет вовсе | Ghostwriter | KDE Bugzilla #471793 |
| 50 | **Печать удалена как фича** | Разработчик убрал печать («странные баги на некоторых платформах»), замены нет | Ghostwriter | [ghostwriter.kde.org](https://ghostwriter.kde.org/) |
| 51 | **Потеря данных при сохранении на сетевую папку** | Файл на смонтированном ресурсе не сохраняется, ошибка не показывается | Ghostwriter | KDE Bugzilla #524940 (2026-08-29) |
| 52 | **Ложное срабатывание детектора внешних изменений** | OneDrive «трогает» файл → предложение перезагрузить → перезагрузка стирает несохранённые правки | MarkText | [#2592](https://github.com/marktext/marktext/issues/2592) |
| 53 | **Внешнее изменение файла требует перезапуска приложения** | Правка в другом редакторе не подхватывается даже после закрытия и повторного открытия вкладки | Zettlr | [#4626](https://github.com/Zettlr/Zettlr/issues/4626) |
| 54 | **Сломанная scroll-синхронизация годами** | Топ-issue проекта, открыт с 2022, не исправлен | PanWriter | [#95](https://github.com/mb21/panwriter/issues/95) |
| 55 | **Синхронизация портит текст** | Правки с двух устройств через Google Drive «вставляются в бессвязные места»; ответа нет | StackEdit | [#1882](https://github.com/benweet/stackedit/issues/1882) |
| 56 | **Полнотекстовый поиск за деньги или отсутствует** | В HackMD поиск только в платном тарифе; в HedgeDoc его нет вообще | HackMD, HedgeDoc | [HedgeDoc #460](https://github.com/hedgedoc/hedgedoc/issues/460) |
| 57 | **Vim-режим — самый популярный неудовлетворённый запрос** | 101 👍 в MarkText, 100 👍 в Anytype, открыт в Typora с 2016 | MarkText, Anytype, Typora | [MT #596](https://github.com/marktext/marktext/issues/596), [Any #247](https://github.com/anyproto/anytype-ts/issues/247), [Typ #187](https://github.com/typora/typora-issues/issues/187) |
| 58 | **Backlinks просят везде и почти нигде не делают** | Открытые запросы: VNote 6+ лет, Zettlr с 2020, Markdown Monster, отказ в Inkdrop | VNote, Zettlr, Markdown Monster, Inkdrop | [VN #1364](https://github.com/vnotex/vnote/issues/1364), [Zet #810](https://github.com/Zettlr/Zettlr/issues/810), [MM #1276](https://github.com/RickStrahl/MarkdownMonster/issues/1276), [Ink forum](https://forum.inkdrop.app/t/backlinks-roam-obsidian/1928) |
| 59 | **Производительность деградирует по документированному порогу** | Собственный FAQ признаёт: превью тормозит после ~2 000 строк, документы >500 КБ «вызывают заметные проблемы» | Markdown Monster | [markdownmonster.west-wind.com](https://markdownmonster.west-wind.com/) |
| 60 | **Обещание «plain markdown» отзывают задним числом** | Переход на SQLite в Logseq 2.0 и метаданные Joplin в теле .md подрывают исходный контракт переносимости | Logseq, Joplin | [Logseq discuss (61 тыс. просмотров)](https://discuss.logseq.com/t/why-the-database-version-and-how-its-going/26744) |

### Что пользователи хвалят (QoL, которое стоит скопировать)

| Фича | Продукт | Источник |
|---|---|---|
| Вставка URL поверх выделения → готовая ссылка | Markdown All in One | [#20](https://github.com/yzhang-gh/vscode-markdown/issues/20) |
| Reveal in Explorer / Finder | Obsidian, VS Code | forum.obsidian.md |
| Typewriter scrolling + Zen mode | iA Writer, Ulysses (просят в Obsidian) | [#2788](https://forum.obsidian.md/t/zen-mode-and-typewriter-mode-for-focused-writing/2788) |
| Запоминание позиции курсора/скролла | плагин Obsidian | [#962](https://forum.obsidian.md/t/remember-restore-document-position-scroll-position-cursor-note-position/962) |
| Sticky scroll (липкий заголовок) как в VS Code | VS Code, PowerToys Monaco preview | [PowerToys File Explorer add-ons](https://learn.microsoft.com/en-us/windows/powertoys/file-explorer) |
| Нативный рендер Mermaid как главное УТП | Ferrite (241 очко на HN) | [HN 46571980](https://news.ycombinator.com/item?id=46571980) |
| Drag-and-drop картинки с автокопированием в папку проекта | Zettlr | [#335](https://github.com/Zettlr/Zettlr/issues/335) |
| Pinned notes | Joplin (реализовано по топ-запросу) | [#296](https://github.com/laurent22/joplin/issues/296) |
| Reading time / word count / grade level в статусбаре | Marked 2 | [marked2app.com](https://marked2app.com/) |
| TOC с typeahead-поиском по заголовкам | Marked 2 | [marked2app.com](https://marked2app.com/) |
| Рендер сразу при сохранении внешнего редактора + автоскролл к правке | Marked 2 | [markedapp.com](https://markedapp.com/) |
| Тема, следующая настройке Windows, без своих настроек | MDHero | [mdhero.app](https://mdhero.app/windows/) |
| Открытие GitHub-URL как markdown | MDHero | [mdhero.app](https://mdhero.app/windows/) |
| Три вида front matter (скрыть/таблица/код) | VS Code 1.121 | [v1_121](https://code.visualstudio.com/updates/v1_121) |
| Rename Symbol (F2) чинит все ссылки на заголовок | VS Code, marksman | [docs](https://code.visualstudio.com/docs/languages/markdown) |
| Полное отключение форматирования одной галкой | Notepad | [Windows Insider Blog](https://blogs.windows.com/windows-insider/2025/05/30/text-formatting-in-notepad-begin-rolling-out-to-windows-insiders/) |

---

## 4. Анти-фичи: что сознательно не делаем

| # | Анти-фича | Почему ломает минимализм | Доказательство из поля |
|---|---|---|---|
| A-1 | **Система плагинов** | Плагины = вес старта (до минуты у Obsidian), поломки от обновлений ядра, неограниченный доступ к ФС и сети, бесконечная поддержка API | Obsidian: 7 281 плагин, Lazy Plugin Loader как народное лекарство; vim-режим сломан апдейтом ([#32743](https://forum.obsidian.md/t/vim-broken-in-latest-update-0-13-25-26/32743)); отсутствие песочницы признано вендором |
| A-2 | **Собственная синхронизация / облако** | Главный источник инцидентов потери данных во всей категории; требует аккаунтов, серверов, шифрования и подписки | Obsidian Sync: конфликты без правок, дублирование кусков, молчаливые слияния; Joplin: удаление старой версии вместо конфликта. Правильный ответ — просто хорошо жить в папке OneDrive/Dropbox/Syncthing/git |
| A-3 | **Собственный формат хранения / БД** | Убивает переносимость и делает продукт заложником миграций | Bear заперт в БД настолько, что сам вендор выпустил Lettera для plain `.md`; Logseq годами мигрирует file→DB, теряя доверие; Joplin хранит в SQLite и получает issues про необратимую потерю |
| A-4 | **Граф связей** | Демо-фича: красиво в обзорах, почти не используется; требует индексации всей библиотеки | «You All Say the Graph Is Useless» — заголовок треда на форуме Obsidian |
| A-5 | **Блочный редактор с drag-and-drop блоков** | Уводит из plain-text в Notion-подобную модель; ломает round-trip и diff | AFFiNE, Anytype, Logseq — markdown у них формат обмена, а не источник истины |
| A-6 | **AI-ассистент внутри редактора** | Требует сети и аккаунта, противоречит local-first, дорог в поддержке, устаревает быстрее продукта | Reor (AI-first markdown) архивирован 2026-03-07; Kuku остался только на macOS |
| A-7 | **Real-time коллаборация** | CRDT/OT — самая дорогая подсистема, нужна доле процента desktop-пользователей | Это класс HedgeDoc/HackMD/AFFiNE, отдельная категория продукта |
| A-8 | **Панель тулбара с иконками по умолчанию** | Отнимает вертикаль, требует иконографии, дублирует палитру команд | Notepad добавил тулбар — и сразу дал галку «выключить форматирование целиком» |
| A-9 | **Множество движков диаграмм (PlantUML, Graphviz, Vega, D2, WaveDrom)** | Каждый — внешний рантайм (Java/Python/сервер) и отдельная поверхность отказа | Typora явно отклонила PlantUML в пользу одного Mermaid ([#297](https://github.com/typora/typora-issues/issues/297)) |
| A-10 | **Автоматическое переформатирование при сохранении** | Файл, изменённый не пользователем, — предательство доверия и катастрофа в git-diff | MarkText [#2189](https://github.com/marktext/marktext/issues/2189) — единственная причина, по которой продукт считают ненадёжным |
| A-11 | **Собственный диалект markdown** | Каждый нестандартный тег снижает переносимость; лучше читать чужие диалекты, чем изобретать свой | Markdown XL (Ulysses) и Dataview (Obsidian) — типовые истории про lock-in |
| A-12 | **Обязательный «vault»/импорт при первом запуске** | Барьер входа там, где пользователь хотел просто открыть один файл | Прямая формулировка запроса PowerToys #45267 |
| A-13 | **Telemetry и аккаунт** | Категория чувствительна к приватности; отсутствие телеметрии — маркетинговый аргумент | Zettlr и MDHero рекламируют «no telemetry / no account» как фичу |
| A-14 | **Минимап** | Визуальный шум, полезен в коде, не в прозе | Есть у VS Code/Notable — ни разу не встретился как повод выбрать редактор |
| A-15 | **Задачи, канбан, календарь, spaced repetition** | Каждая такая подсистема тянет за собой модель данных и превращает ридер в PKM-комбайн | Logseq (flashcards), Obsidian (Bases/Kanban), Joplin (todo) — все с соответствующим ростом жалоб на скорость |
| A-16 | **Интерактивные чекбоксы в режиме чтения** | Клик по чекбоксу меняет файл — нарушение контракта «Read = только чтение» | Компромисс: разрешить только при явном переключении в Edit/Rich |
| A-17 | **Загрузка изображений на внешний хостинг** | Сеть, аккаунты, чужие сервисы внутри локального приложения | Typora и Markdown Monster делают это через сторонние утилиты (PicGo) — правильная граница |
| A-18 | **Публикация сайта / блога** | Отдельный продукт (Obsidian Publish, Markdown Monster weblog) со своей экономикой | Тянет за собой шаблоны, домены, поддержку CMS |
| A-19 | **Кросс-платформенность при нехватке ресурсов** | Обещать macOS/Linux и не тянуть их хуже, чем честно быть Windows-only | Ghostwriter: Linux — релиз 26.08.0 (август 2026), Windows — портативная сборка 2022 года без установщика (KDE Bug #471793). Markdown Monster честно Windows-only и от этого выигрывает |
| A-20 | **Закрытие исходников или смена лицензии задним числом** | Разрушает доверие в категории, где переносимость данных — главная ценность | Notable закрыл код и остановился ([#1759](https://github.com/notable/notable/issues/1759)); Anytype зовёт себя open source под несовместимой ASAL 1.0 и получает разбор на HN; Tiptap за два года трижды менял модель (paywall → открытие Pro → отмена бесплатного облака) |
| A-21 | **Ставка на «оно само» — заброшенный проект без плана передачи** | Однопользовательские проекты замирают на годы, а issue продолжают копиться | MarkText молчал ~3 года (61 тыс. звёзд, 722 issue) и возродился только в мае 2026; StackEdit не трогали с 2023; Notable — с марта 2023. Zettlr — противоположный пример: Steering Committee с 2024 явно ради снижения bus-factor |

### Три «красные линии» продукта

1. **Файл — источник истины.** Ни блочной модели, ни БД, ни своего формата. Байты, которые пользователь не редактировал, не меняются никогда — включая EOL, BOM и кодировку.
2. **Ноль сетевых зависимостей в базовом сценарии.** Открытие, чтение, поиск, экспорт в PDF/HTML работают офлайн, без аккаунта, без телеметрии.
3. **Быстрее, чем «просто открыть в браузере».** Если холодный старт медленнее 500 мс или RAM выше ~150 МБ, продукт теряет единственное конкурентное преимущество перед VS Code и Obsidian.

---

## Приложение А. Движки редактирования (что под капотом у конкурентов)

Выбор движка предопределяет, выполним ли контракт «файл — источник истины» (D11 / A-10).

| Движок | Модель документа | Markdown-возможности | Кто использует | Пригодность для «Plain» |
|---|---|---|---|---|
| **CodeMirror 6** | **Простой текст — всегда источник истины**; viewport-рендеринг + карта высот всего документа, инкрементальный парсинг, декорации/виджеты | `@codemirror/lang-markdown` даёт подсветку и парсинг; «live preview» (спрятать `**`, показать жирный) строится хостом на widget-декорациях | **Obsidian** (по собственным docs), Replit, Sourcegraph, Inkdrop, Zettlr, MarkText (Source-режим) | **Основной кандидат.** Единственная архитектура, где round-trip лосслесс by design, и ровно тот механизм, которым сделан гибридный Live Preview |
| **ProseMirror** | Схематизированное JSON-дерево; markdown — производная сериализация | `prosemirror-markdown` — только чистый CommonMark, без GFM-таблиц/тасклистов и без inline-HTML | NYT CMS, Atlassian/Confluence, база для Tiptap и Milkdown | Для Rich-поверхности возможен, но всю markdown-прослойку придётся строить самим |
| **Tiptap** (на ProseMirror) | JSON/HTML-дерево | Официальный `@tiptap/markdown` появился только в v3.7.0 (2026) и всё ещё правит баги сериализации; есть Highlight, Mathematics (KaTeX), TableOfContents, Emoji; **нет Mermaid, wikilinks, callouts** | GitLab Content Editor | Коммерческие тарифы $49–999/мес за облако; бесплатный Cloud-тариф убран в 2025 — риск для планирования |
| **Milkdown** (на ProseMirror + remark) | **Markdown-first по замыслу** («вдохновлён Typora») | CommonMark + GFM-пресеты (таблицы, тасклисты, сноски, strikethrough), emoji, slash, collab; **нет front matter (#1712), нет Mermaid (#1479), ограниченный HTML (#1249)** | В основном небольшие OSS-проекты; крупных внедрений не подтверждено | Идеологически ближе всех, но мейнтейнер открыто пишет об ограниченных ресурсах, а именно недостающие пункты — наш обязательный минимум |
| **Lexical** (Meta) | Дерево узлов; markdown — тонкий импорт/экспорт | `@lexical/markdown`: заголовки, списки, код, цитаты, bold/italic/code/strike/ссылки. **Нет GFM-таблиц, тасклистов, сносок, math** из коробки; открытые баги round-trip | Публично подтверждённых внедрений не найдено | Стартовая база ещё тоньше, чем у Tiptap |
| **Monaco** | Простой текст, IDE-архитектура (language services, web workers) | Только подсветка через Monarch, **никакого превью** — в VS Code рендер живёт в отдельном webview | VS Code, github.dev, Codespaces, Notable, PowerToys-превью кода | Избыточен: тяжёлый бандл, известные нерешённые проблемы на мобильных/тач |
| **Qt / нативный C++** | Простой текст | Всё рендерится самим приложением (QLiteHtml или QWebEngine) | QOwnNotes, VNote, Ghostwriter | Даёт лучший старт и RAM, но платит фиделити рендера — у всех троих markdown беднее конкурентов |
| **Tauri + WebView2** | — (оболочка) | — | MDHero (~8 МБ) | Холодный старт ~380 мс против ~1 420 мс у Electron, RAM ~40–80 МБ против 150–400 МБ. Цена — различия WebView между ОС (для Windows-only продукта не проблема) |

**Существенный факт для планирования зависимостей:** в апреле 2026 Марейн Хавербеке (единственный автор и ProseMirror, и CodeMirror) перенёс основные репозитории обоих проектов с GitHub на собственный Forgejo (`code.haverbeke.berlin`); GitHub-репозитории заархивированы. Проекты живы (коммиты и релизы в npm продолжаются), но issue/PR теперь подаются в другое место, а «звёзды» и активность на GitHub заморожены — это меняет оценку живости, если смотреть только на GitHub.

**Вывод:** CodeMirror 6 для поверхностей Read/Edit + собственный слой декораций для Rich (модель Obsidian), рендер превью — markdown-it с фиксированным набором плагинов; оболочка — Tauri/WebView2 ради стартовой цели <500 мс и <150 МБ.

---

## 5. Источники

### Официальная документация и продуктовые страницы
- Obsidian: https://obsidian.md/ · https://obsidian.md/pricing · https://obsidian.md/changelog/ · https://obsidian.md/help/syntax · https://obsidian.md/help/advanced-syntax · https://obsidian.md/help/callouts · https://obsidian.md/help/editing-shortcuts · https://obsidian.md/help/bases · https://obsidian.md/cli · https://community.obsidian.md/
- Typora: https://typora.io/ · https://support.typora.io/Shortcut-Keys/ · https://support.typora.io/Markdown-Reference/ · https://support.typora.io/Draw-Diagrams-With-Markdown/ · https://support.typora.io/Export/ · https://support.typora.io/Search/ · https://support.typora.io/Version-Control/ · https://support.typora.io/purchase/
- iA Writer: https://ia.net/writer · https://ia.net/writer/pricing · https://ia.net/writer/support/basics/markdown-guide · https://ia.net/writer/support/editor/focus-mode · https://ia.net/writer/support/library/wikilinks · https://ia.net/writer/support/help/version-history
- Bear: https://bear.app/faq/how-to-use-markdown-in-bear/ · https://bear.app/faq/what-about-bear-for-web-android-windows/ · https://bear.app/faq/command-line-interface/ · https://blog.bear.app/2026/07/bear-now-supports-mermaid-diagrams/
- Ulysses: https://help.ulysses.app/en_US/dive-into-editing/markdown-xl · https://help.ulysses.app/export · https://help.ulysses.app/en_US/the-library/external-folders · https://help.ulysses.app/en_US/the-library/backups · https://ulysses.app/tutorials/typewriter-mode
- MarkText: https://github.com/marktext/marktext · https://github.com/marktext/marktext/releases
- Zettlr: https://www.zettlr.com/ · https://github.com/Zettlr/Zettlr/releases
- Ghostwriter: https://ghostwriter.kde.org/
- Joplin: https://joplinapp.org/help/apps/markdown/
- Logseq: https://github.com/logseq/logseq/releases · https://discuss.logseq.com/
- Inkdrop: https://www.inkdrop.app/
- Notable: https://github.com/notable/notable
- QOwnNotes: https://www.qownnotes.org/ · https://github.com/pbek/QOwnNotes/releases
- VNote: https://github.com/vnotex/vnote · https://github.com/vnotex/vnote/releases
- PanWriter: https://github.com/mb21/panwriter
- StackEdit: https://stackedit.io/
- HedgeDoc: https://docs.hedgedoc.org/
- Markdown Monster: https://markdownmonster.west-wind.com/
- Deepdwn: https://billiam.itch.io/deepdwn
- MDHero: https://mdhero.app/windows/
- Marked 2/3: https://marked2app.com/ · https://markedapp.com/
- AFFiNE: https://github.com/toeverything/AFFiNE · Anytype: https://anytype.io/
- Milkdown: https://milkdown.dev/ · CodeMirror 6: https://codemirror.net/docs/guide/
- Marp: https://marp.app/ · marksman: https://github.com/artempyanykh/marksman · markdownlint: https://github.com/DavidAnson/markdownlint · Foam: https://github.com/foambubble/foam · MPE: https://shd101wyy.github.io/markdown-preview-enhanced/ · Markdown All in One: https://github.com/yzhang-gh/vscode-markdown

### Спецификации и парсеры
- GitHub Flavored Markdown Spec: https://github.github.com/gfm/
- markdown-it плагины (abbr, alert, attrs, container, dl, footnote, katex, mark, sub, sup, tasklist, tab, plantuml, spoiler, …): https://mdit-plugins.github.io/
- markdown-it-deflist: https://github.com/markdown-it/markdown-it-deflist
- Pandoc User's Guide (73 расширения, `--reference-doc`): https://pandoc.org/MANUAL.html
- markdown-it-github-alerts: https://github.com/antfu/markdown-it-github-alerts

### VS Code / Zed / Helix
- https://code.visualstudio.com/docs/languages/markdown
- https://code.visualstudio.com/updates/v1_121 (встроенный Mermaid, `markdown.preview.frontMatter`)
- https://code.visualstudio.com/updates/v1_131 · https://code.visualstudio.com/updates/v1_132 (Hybrid Markdown Editor, markdown diffs)
- https://code.visualstudio.com/api/extension-guides/markdown-extension
- https://zed.dev/docs/languages/markdown · https://docs.helix-editor.com/lang-support.html

### Windows-платформа
- Notepad, lightweight formatting (11.2504, май 2025): https://blogs.windows.com/windows-insider/2025/05/30/text-formatting-in-notepad-begin-rolling-out-to-windows-insiders/
- Notepad, markdown-таблицы (11.2510.6.0, 21.11.2025): https://blogs.windows.com/windows-insider/2025/11/21/notepad-update-begins-rolling-out-to-windows-insiders/
- Notepad, strikethrough + вложенные списки (11.2512.10.0, 21.01.2026): https://blogs.windows.com/windows-insider/2026/01/21/notepad-and-paint-updates-begin-rolling-out-to-windows-insiders/
- PowerToys File Explorer add-ons (Markdown preview handler, «Show local images», отсутствие thumbnail для .md): https://learn.microsoft.com/en-us/windows/powertoys/file-explorer
- PowerToys, запрос на отдельный «Markdown Reader»: https://github.com/microsoft/PowerToys/issues/45267
- Windows Community Toolkit MarkdownTextBlock (нативный XAML-рендер, ограничения): https://learn.microsoft.com/en-us/windows/communitytoolkit/controls/markdowntextblock
- Файловые ассоциации Windows 10/11, ProgID и UserChoice: https://setuserfta.com/guide-to-understanding-progids-and-file-type-associations/ · https://woshub.com/managing-default-file-associations-in-windows-10/
- Windows-markdown-вьюверы, обзор ниши: https://macmdviewer.com/blog/markdown-viewer-windows

### Трекеры issue (жалобы и запросы)
- Typora: [#162](https://github.com/typora/typora-issues/issues/162) · [#187](https://github.com/typora/typora-issues/issues/187) · [#297](https://github.com/typora/typora-issues/issues/297) · [#344](https://github.com/typora/typora-issues/issues/344) · [#638](https://github.com/typora/typora-issues/issues/638) · [#1000](https://github.com/typora/typora-issues/issues/1000) · [#1765](https://github.com/typora/typora-issues/issues/1765) · [#2351](https://github.com/typora/typora-issues/issues/2351) · [#3453](https://github.com/typora/typora-issues/issues/3453) · [#3495](https://github.com/typora/typora-issues/issues/3495) · [#4762](https://github.com/typora/typora-issues/issues/4762) · [#6181](https://github.com/typora/typora-issues/issues/6181) · [#6290](https://github.com/typora/typora-issues/issues/6290) · [#6517](https://github.com/typora/typora-issues/issues/6517) · [#6542](https://github.com/typora/typora-issues/issues/6542) · [#6620](https://github.com/typora/typora-issues/issues/6620)
- MarkText: [#138](https://github.com/marktext/marktext/issues/138) · [#549](https://github.com/marktext/marktext/issues/549) · [#596](https://github.com/marktext/marktext/issues/596) · [#656](https://github.com/marktext/marktext/issues/656) · [#1275](https://github.com/marktext/marktext/issues/1275) · [#1869](https://github.com/marktext/marktext/issues/1869) · [#2168](https://github.com/marktext/marktext/issues/2168) · [#2189](https://github.com/marktext/marktext/issues/2189) · [#2466](https://github.com/marktext/marktext/issues/2466) · [#2496](https://github.com/marktext/marktext/issues/2496) · [#2819](https://github.com/marktext/marktext/issues/2819) · [#3518](https://github.com/marktext/marktext/issues/3518) · [#4887](https://github.com/marktext/marktext/issues/4887) · [#5115](https://github.com/marktext/marktext/issues/5115)
- Joplin: [#176](https://github.com/laurent22/joplin/issues/176) · [#255](https://github.com/laurent22/joplin/issues/255) · [#296](https://github.com/laurent22/joplin/issues/296) · [#375](https://github.com/laurent22/joplin/issues/375) · [#591](https://github.com/laurent22/joplin/issues/591) · [#2383](https://github.com/laurent22/joplin/issues/2383) · [#3381](https://github.com/laurent22/joplin/issues/3381) · [#3991](https://github.com/laurent22/joplin/issues/3991) · [#8958](https://github.com/laurent22/joplin/issues/8958) · [#13531](https://github.com/laurent22/joplin/issues/13531) · [#14954](https://github.com/laurent22/joplin/issues/14954) · [#15246](https://github.com/laurent22/joplin/issues/15246)
- Zettlr: [#192](https://github.com/Zettlr/Zettlr/issues/192) · [#335](https://github.com/Zettlr/Zettlr/issues/335) · [#532](https://github.com/Zettlr/Zettlr/issues/532) · [#810](https://github.com/Zettlr/Zettlr/issues/810) · [#818](https://github.com/Zettlr/Zettlr/issues/818) · [#1050](https://github.com/Zettlr/Zettlr/issues/1050) · [#1966](https://github.com/Zettlr/Zettlr/issues/1966) · [#3628](https://github.com/Zettlr/Zettlr/issues/3628) · [#3727](https://github.com/Zettlr/Zettlr/issues/3727)
- VS Code: [#2766](https://github.com/microsoft/vscode/issues/2766) · [#53992](https://github.com/microsoft/vscode/issues/53992) · [#65258](https://github.com/microsoft/vscode/issues/65258) · [#86564](https://github.com/microsoft/vscode/issues/86564) · [#91279](https://github.com/microsoft/vscode/issues/91279) · [#114319](https://github.com/microsoft/vscode/issues/114319) · [#164267](https://github.com/microsoft/vscode/issues/164267) · [#183560](https://github.com/microsoft/vscode/issues/183560) · [#209652](https://github.com/microsoft/vscode/issues/209652) · [#239038](https://github.com/microsoft/vscode/issues/239038) · [#265277](https://github.com/microsoft/vscode/issues/265277) · [#316977](https://github.com/microsoft/vscode/issues/316977) · [#317033](https://github.com/microsoft/vscode/issues/317033) · [#317118](https://github.com/microsoft/vscode/issues/317118)
- Markdown All in One: [#20](https://github.com/yzhang-gh/vscode-markdown/issues/20) · [#151](https://github.com/yzhang-gh/vscode-markdown/issues/151) · [#423](https://github.com/yzhang-gh/vscode-markdown/issues/423) · [#855](https://github.com/yzhang-gh/vscode-markdown/issues/855)
- Logseq: [#2637](https://github.com/logseq/logseq/issues/2637) · [#3150](https://github.com/logseq/logseq/issues/3150) · [#4484](https://github.com/logseq/logseq/issues/4484) · [#11378](https://github.com/logseq/logseq/issues/11378) · [#11644](https://github.com/logseq/logseq/issues/11644)
- Zed: [#10899](https://github.com/zed-industries/zed/issues/10899) · [#40813](https://github.com/zed-industries/zed/issues/40813) · [#56160](https://github.com/zed-industries/zed/issues/56160) · [#57775](https://github.com/zed-industries/zed/issues/57775) · [#60388](https://github.com/zed-industries/zed/issues/60388) · [discussion #23951](https://github.com/zed-industries/zed/discussions/23951) · [discussion #32137](https://github.com/zed-industries/zed/discussions/32137)
- Helix: [#2824](https://github.com/helix-editor/helix/issues/2824) · [discussion #11325](https://github.com/helix-editor/helix/discussions/11325)
- MarkText (дополнительно): [#2222 одна папка](https://github.com/marktext/marktext/issues/2222) · [#2329 wikilinks](https://github.com/marktext/marktext/issues/2329) · [#2592 ложный external-change → потеря данных](https://github.com/marktext/marktext/issues/2592) · [#4191 возрождение проекта](https://github.com/marktext/marktext/issues/4191) · [#5224 highlight](https://github.com/marktext/marktext/issues/5224) · [#4098 «проект заброшен, но есть форк»](https://github.com/marktext/marktext/issues/4098)
- Zettlr (дополнительно): [#4626 внешние изменения](https://github.com/Zettlr/Zettlr/issues/4626) · [#5077 command palette](https://github.com/Zettlr/Zettlr/issues/5077) · [#5985 замедление](https://github.com/Zettlr/Zettlr/issues/5985) · [#6079 фриз при Ctrl+S](https://github.com/Zettlr/Zettlr/issues/6079) · [#4982](https://github.com/Zettlr/Zettlr/issues/4982) · [#6497](https://github.com/Zettlr/Zettlr/issues/6497)
- Ghostwriter (KDE Bugzilla): [список открытых по голосам](https://bugs.kde.org/buglist.cgi?product=ghostwriter&resolution=---&order=votes%20desc&limit=15) — #466199 YAML front matter, #471793 сборка для Windows, #505519 утечка памяти, #524940 потеря данных на смонтированных папках
- Notable: [#116 version control](https://github.com/notable/notable/issues/116) · [#140 поиск-замена по всем](https://github.com/notable/notable/issues/140) · [#284 WYSIWYG](https://github.com/notable/notable/issues/284) · [#530 TOC](https://github.com/notable/notable/issues/530) · [#104 темы](https://github.com/notable/notable/issues/104) · [#1759 «станьте open source»](https://github.com/notable/notable/issues/1759) · [SOURCE_CODE.md](https://github.com/notable/notable/blob/master/SOURCE_CODE.md)
- QOwnNotes: [#1421 QWebEngine](https://github.com/pbek/QOwnNotes/issues/1421) · [#1702 фильтр тегов](https://github.com/pbek/QOwnNotes/issues/1702) · [#2022 regex-поиск](https://github.com/pbek/QOwnNotes/issues/2022) · [#490 пакетный экспорт](https://github.com/pbek/QOwnNotes/issues/490) · [#3468 внешние изменения при move](https://github.com/pbek/QOwnNotes/issues/3468)
- VNote: [#410 утечка памяти](https://github.com/vnotex/vnote/issues/410) · [#1364 backlinks](https://github.com/vnotex/vnote/issues/1364) · [#1606 оптимизация памяти](https://github.com/vnotex/vnote/issues/1606)
- PanWriter: [#66 автоперезагрузка](https://github.com/mb21/panwriter/issues/66) · [#71 Mermaid](https://github.com/mb21/panwriter/issues/71) · [#95 scroll sync](https://github.com/mb21/panwriter/issues/95) · [#170 CodeMirror 6](https://github.com/mb21/panwriter/issues/170)
- Markdown Monster: [#694 typewriter — wontfix](https://github.com/RickStrahl/MarkdownMonster/issues/694) · [#1234 файл 140 МБ](https://github.com/RickStrahl/MarkdownMonster/issues/1234) · [#1276 wikilinks/Foam](https://github.com/RickStrahl/MarkdownMonster/issues/1276) · [LICENSE.md](https://github.com/RickStrahl/MarkdownMonster/blob/main/LICENSE.md)
- StackEdit: [#323 десктоп](https://github.com/benweet/stackedit/issues/323) · [#1347 глобальный поиск](https://github.com/benweet/stackedit/issues/1347) · [#1876 «проект заброшен?»](https://github.com/benweet/stackedit/issues/1876) · [#1882 порча текста при sync](https://github.com/benweet/stackedit/issues/1882)
- HedgeDoc / CodiMD / HackMD: [HedgeDoc #460 поиск](https://github.com/hedgedoc/hedgedoc/issues/460) · [#2873 цитирование](https://github.com/hedgedoc/hedgedoc/issues/2873) · [#5808 производительность 2.0](https://github.com/hedgedoc/hedgedoc/issues/5808) · [CodiMD #1170 переход на open-core](https://github.com/hackmdio/codimd/issues/1170) · [CodiMD #1566 история ревизий](https://github.com/hackmdio/codimd/issues/1566) · [история форка](https://hedgedoc.org/history/)
- Joplin (дополнительно): [#16277 ProseMirror-RTE для десктопа](https://github.com/laurent22/joplin/issues/16277) · [security advisories](https://github.com/laurent22/joplin/security/advisories) · [обсуждение WYSIWYG и фиделити markdown](https://discourse.joplinapp.org/t/experimental-wysiwyg-editor-in-joplin)
- Logseq (дополнительно): [релиз 2.0.1 Beta](https://github.com/logseq/logseq/releases/tag/2.0.1) · [#10563 стабильность sync](https://github.com/logseq/logseq/issues/10563) · [db-test #7 — что ломает миграция](https://github.com/logseq/db-test/issues/7)
- Inkdrop: [отказ от backlinks (форум)](https://forum.inkdrop.app/t/backlinks-roam-obsidian/1928) · [MCP-сервер](https://github.com/inkdropapp/mcp-server)
- AFFiNE: [#5491 шифрование локального хранилища](https://github.com/toeverything/AFFiNE/issues/5491) · [#7450 math и Mermaid](https://github.com/toeverything/AFFiNE/issues/7450) · [#7479 колонки](https://github.com/toeverything/AFFiNE/issues/7479) · [#8399 бэкап](https://github.com/toeverything/AFFiNE/issues/8399)
- Anytype: [LICENSE.md (ASAL 1.0)](https://github.com/anyproto/anytype-ts/blob/main/LICENSE.md) · [модель хранения](https://doc.anytype.io/anytype/data/storage) · [импорт/экспорт](https://doc.anytype.io/anytype/data/import-and-export) · [#247 vim](https://github.com/anyproto/anytype-ts/issues/247) · [#1490 мультиокна](https://github.com/anyproto/anytype-ts/issues/1490) · [критика лицензии на HN](https://news.ycombinator.com/item?id=36799548)

### Движки редактирования
- ProseMirror: https://prosemirror.net/ · [prosemirror-markdown](https://github.com/prosemirror/prosemirror-markdown) · [переезд на Forgejo](https://discuss.prosemirror.net/t/prosemirrors-migration-to-forgejo) · https://code.haverbeke.berlin/prosemirror/prosemirror
- CodeMirror 6: https://codemirror.net/docs/guide/ · [гайд по миграции с CM5](https://codemirror.net/docs/migration/) · https://code.haverbeke.berlin/codemirror/dev · [Obsidian использует CodeMirror](https://docs.obsidian.md/Plugins/Editor/Editor)
- Tiptap: https://tiptap.dev/pricing · [от open source к платформе](https://tiptap.dev/open-source-to-platform) · [GitLab Content Editor на Tiptap](https://gitlab.com/gitlab-org/gitlab/-/merge_requests/166284)
- Milkdown: https://milkdown.dev/ · [#1249 ограничения HTML](https://github.com/Milkdown/milkdown/issues/1249) · [#1712 front matter](https://github.com/Milkdown/milkdown/issues/1712) · [discussion #1479 Mermaid](https://github.com/orgs/Milkdown/discussions/1479) · [discussion #1380 ресурсы проекта](https://github.com/orgs/Milkdown/discussions/1380)
- Lexical: https://lexical.dev/docs/packages/lexical-markdown · https://github.com/facebook/lexical
- Monaco: https://github.com/microsoft/monaco-editor

### Форумы и сообщества
- Obsidian Forum: [#174](https://forum.obsidian.md/t/expand-the-file-watcher-capability-to-the-whole-vault-instead-of-just-the-root/174) · [#962](https://forum.obsidian.md/t/remember-restore-document-position-scroll-position-cursor-note-position/962) · [#2342](https://forum.obsidian.md/t/pasting-same-image-twice-should-not-duplicate-the-image-but-paste-the-same-link/2342) · [#2788](https://forum.obsidian.md/t/zen-mode-and-typewriter-mode-for-focused-writing/2788) · [#3579](https://forum.obsidian.md/t/relative-image-and-attachment-paths-get-broken-critical/3579) · [#4386](https://forum.obsidian.md/t/broken-links-in-relative-path-mode-on-move-rename/4386) · [#4395](https://forum.obsidian.md/t/global-mass-vault-wise-search-replace/4395) · [#13107](https://forum.obsidian.md/t/page-breaks-for-pdfs/13107) · [#13381](https://forum.obsidian.md/t/13381) · [#14943](https://forum.obsidian.md/t/14943) · [#16633](https://forum.obsidian.md/t/slow-performance-with-large-vaults/16633) · [#19329](https://forum.obsidian.md/t/are-we-moving-away-from-portability-how-much-is-obsidian-locking-our-notes-in/19329) · [#20162](https://forum.obsidian.md/t/20162) · [#25388](https://forum.obsidian.md/t/i-moved-my-attachments-from-folder-a-to-folder-b-then-when-i-open-my-note-which-contains-the-image-or-file-was-in-folder-a-after-i-moved-them-to-b-the-note-unlinks-them/25388) · [#27120](https://forum.obsidian.md/t/ability-to-choose-where-page-breaks-in-pdf/27120) · [#28477](https://forum.obsidian.md/t/how-to-move-500-pasted-images-to-a-folder-without-breaking-links/28477) · [#32743](https://forum.obsidian.md/t/vim-broken-in-latest-update-0-13-25-26/32743) · [#54905](https://forum.obsidian.md/t/add-printing-capability-electron-has-the-api/54905) · [#55383](https://forum.obsidian.md/t/pdf-export-changed-fonts-on-me/55383) · [#58020](https://forum.obsidian.md/t/58020) · [#63825](https://forum.obsidian.md/t/63825) · [#64881](https://forum.obsidian.md/t/64881) · [#66614](https://forum.obsidian.md/t/windows-wrong-window-size-when-re-opening-obsidian-multiple-monitors-with-different-scaling-dpi/66614) · [#70164](https://forum.obsidian.md/t/70164) · [#71444](https://forum.obsidian.md/t/accessibility-label-input-elements-to-assist-with-screen-readers/71444) · [#75494](https://forum.obsidian.md/t/75494) · [#83575](https://forum.obsidian.md/t/persistent-editor-view-state-on-restart/83575) · [#84377](https://forum.obsidian.md/t/84377) · [#93256](https://forum.obsidian.md/t/93256) · [#94732](https://forum.obsidian.md/t/94732) · [#101637](https://forum.obsidian.md/t/page-breaks-for-pdf-again/101637) · [#103245](https://forum.obsidian.md/t/screen-reader-accessibility-issues-in-recent-versions-of-obsidian/103245) · [#108029](https://forum.obsidian.md/t/108029) · [#113392](https://forum.obsidian.md/t/113392) · [#19669](https://forum.obsidian.md/t/accessibility-obsidian-with-screen-readers/19669)
- Bear Community: [#12381](https://community.bear.app/t/note-revision-history/12381) · [#12438](https://community.bear.app/t/support-for-mermaid-diagramming/12438) · [#13105](https://community.bear.app/t/yaml-front-matter-uses-in-bear/13105) · [#17397](https://community.bear.app/t/basically-a-perfect-app-but-typewriter-scrolling-focus-mode/17397) · [#19319](https://community.bear.app/t/fr-raw-markdown-source-view/19319) · [#19547](https://community.bear.app/t/command-palette-for-keyboard-driven-search-file-opening-actions-etc/19547)
- Logseq Discuss: [#1484](https://discuss.logseq.com/t/very-slow-performance-with-large-local-graph/1484) · [#22314](https://discuss.logseq.com/t/logseq-performance-very-bad-as-graph-grows/22314)
- Hacker News: [23723775](https://news.ycombinator.com/item?id=23723775) (уход с Obsidian на Zettlr из-за лицензии) · [38571088](https://news.ycombinator.com/item?id=38571088) (цена iA Writer) · [46571980](https://news.ycombinator.com/item?id=46571980) (Ferrite — Mermaid как УТП) · [46572127](https://news.ycombinator.com/item?id=46572127) (закрытость Typora)

### Аналитика и обзоры
- Tauri vs Electron 2026, замеры старта и RAM: https://www.pkgpulse.com/guides/electron-vs-tauri-2026 · https://tech-insider.org/tauri-vs-electron-2026/
- Obsidian 1.9 / Bases: https://www.neowin.net/news/obsidian-190-launches-with-new-file-format-footnotes-view-plugin-and-more/
- Bear → Lettera (plain-md спинофф): https://9to5mac.com/2026/06/19/bear-app-developers-announce-lettera-a-beautiful-markdown-editor-for-mac/
- Ulysses review 2026: https://quillspace.app/blog/ulysses-app-review
- VS Code Hybrid Markdown Editor против Typora: https://www.thurrott.com/dev/340776/visual-studio-code-now-includes-a-full-markdown-editor
- Ускорение старта Obsidian через ленивую загрузку плагинов: https://tfthacker.substack.com/p/improve-obsidian-startup-time-on-older-devices-with-the-faststart-script-70a6c590309f
