# 00 · Дизайн-система, извлечённая из макетов «Plain»

Источник: `Minimalist markdown editor mockups.zip` → `Markdown Editor.dc.html` (6 экранов 1100×720, IBM Plex Mono). Все значения ниже сняты с inline-CSS макетов.

## Экраны

| ID | Экран | Тема | Особенности |
|----|-------|------|-------------|
| 1a | Reading view | light | рейка «files», вкладка read активна, статус «reading · 38%» |
| 1b | Reading view | dark | то же, «◑ dark» |
| 1c | Edit view (raw markdown) | dark | рейка свёрнута («▸ files» слева над контентом), номера строк, front matter, статус «ln 9, col 118 · markdown · utf-8 · 612 words · unsaved» |
| 1d | Rich edit (WYSIWYG-ish) | light | рейка в режиме «outline» + «links here», плавающий тёмный тулбар выделения, бледные маркеры блоков в левом поле, placeholder «Type / for a block, or just keep writing.» |
| 1e | Library | light | рейка «folders (с счётчиками) + tags», заголовок «All files», сортировка modified/name/created, «+ new», футер «12 files · 9,240 words» |
| 1f | Library + quick search (Ctrl K) | dark | модал 520px, секции files / in text / actions, подвал-подсказка «↑↓ move · ↵ open · ctrl ↵ open in edit», фон затемнён opacity .35 |

Props макета: `lineNumbers: boolean = true`, `focusMode: boolean = false` (focusMode скрывает рейку).

Подсказки «Try next» из макета (кандидаты на фичи): split view (1c рядом с 1a), settings screen в стиле 1e, serif reading mode, смена акцента (orange).

## Цветовые токены

| Токен | Light | Dark | Использование |
|-------|-------|------|---------------|
| `--bg` | `#f7f6f3` | `#141413` | фон окна и контента |
| `--fg` | `#1c1b19` | `#e8e6e1` | основной текст, активные элементы |
| `--muted` | `#8a877f` | `#7a776f` | вторичный текст, неактивные вкладки, метаданные, заголовки секций рейки, синтаксические маркеры в edit |
| `--faint` | `#c9c5bb` | `#3a3936` (номера строк) | плейсхолдеры, маркеры блоков в rich-поле, номера строк |
| `--border` | `#e6e3dc` | `#262523` | 1px разделители (рейка, статус-бар, строки списка) |
| `--surface` | `#eeebe4` | `#1f1e1c` | активная строка в рейке, фон code block |
| `--surface-2` | — | `#262523` | активная строка в quick search (dark) |
| `--quote` | `#5c5a54` | (не задан; предл. `#a9a69f`) | текст цитаты |
| `--accent` | `#7c3aed` | `#a78bfa` | каретка, точка «●/•» изменённого файла, подчёркивание ссылок, совпадение в поиске, «edited» бейдж |
| `--selection` | `rgba(124,58,237,.18)` | `rgba(167,139,250,.28)` | выделение текста |
| `--toolbar-bg` | `#1c1b19` | (инверсия: `#e8e6e1`?) | плавающий тулбар; в макете только light: тёмный на светлом |
| `--toolbar-fg` | `#f7f6f3` | — | |
| `--toolbar-sep` | `#4a4844` | — | разделитель в тулбаре |
| `--modal-bg` | — | `#1c1b19` | quick search (dark); light не показан, предл. `#ffffff`/`#fbfaf8` |
| `--modal-border` | — | `#2e2d2a` | |
| `--modal-fg-2` | — | `#a9a69f` | неактивные строки результатов |

Правило акцента: **только** каретка, выделение, индикатор несохранённого файла, подчёркивание ссылок, подсветка совпадений, активный элемент. Никаких цветных кнопок и иконок.

## Типографика

Шрифт: `'IBM Plex Mono', ui-monospace, Menlo, monospace` везде (UI и контент). Веса 300/400/500/600 + italic 400.

| Элемент | Размер | Вес | Прочее |
|---------|--------|-----|--------|
| Базовый UI | 13px | 400 | |
| Breadcrumbs (title bar) | 11px | 400; корень 600 | gap 14px, разделитель «/» muted |
| Рейка: пункты | 12px | 400 | padding 5px 20px |
| Рейка: заголовки секций | 10px | 400 | uppercase, letter-spacing .12em, muted, padding 0 20px 8px |
| Рейка: search строка | 12px, хинт 10px | | «⌕ search» … «ctrl k» |
| Рейка: футер | 11px | | «12 files · synced», «~/Documents/plain», «outline · files» (переключатель) |
| Переключатель read/edit/rich | 11px | 400 | padding 4px 10px, gap 2px, активный: fg + border-bottom 1px fg; неактивный: muted |
| Контент (read/rich) | 13.5px | 400 | line-height 1.75, max-width 560px, центр, padding-top 36px |
| Мета над заголовком | 11px | | muted, margin-bottom 22px: «4 sep 2026 · 612 words · 3 min» |
| H1 | 22px | 600 | line-height 1.3, letter-spacing -.01em, margin 0 0 26px |
| H2 | 13.5px | 600 | цвет muted, margin 30px 0 14px |
| Параграф | 13.5px | | margin 0 0 20px |
| Blockquote | 13.5px | italic | padding-left 18px, border-left 1px fg, цвет `--quote` |
| Ordered list | | | padding-left 22px, gap 6px между пунктами |
| Code block | 12px | | line-height 1.6, padding 14px 16px, фон `--surface`, white-space pre, без рамки и скругления |
| Ссылка | | | цвет fg, underline, `text-underline-offset: 3px`, `text-decoration-color: accent` |
| Edit view (raw) | 13px | | line-height 1.75, max-width 640px, grid 40px (номера) + 24px gap + текст, `white-space: pre-wrap` |
| Edit: номера строк | 13px | | text-align right, цвет `--faint`, user-select none |
| Edit: синтаксические маркеры (`---`, `#`, `>`, `1.`, `[`, `](`, `)`) | | | цвет muted; заголовки 600; цитата italic; URL в ссылке accent + underline |
| Rich: маркеры блоков в левом поле | 11px | | `#`, `##`, `>` на позиции left -40px, ширина 24px, right-aligned, цвет `--faint`, user-select none |
| Rich: placeholder | 13.5px | | «Type / for a block, or just keep writing.» цвет `--faint` |
| Плавающий тулбар | 11.5px | | height 30px, padding 0 4px, кнопки padding 0 9px: **B** *I* ~~S~~ ` │ link quote; появляется над выделением (top -38px) |
| Library: заголовок | 22px | 600 | «All files», letter-spacing -.01em |
| Library: сортировка | 11px | | «modified · name · created», активная fg, остальные muted; «+ new» fg с margin-left 10px |
| Library: строка файла | 12.5px | | grid `1fr 90px 70px`, gap 16px, padding 11px 0, border-top 1px; имя + путь (11px muted) + бейдж «edited» (10px accent) |
| Library: дата / слова | 11px | | muted; слова right-aligned, формат «1,204 w» |
| Статус-бар | 10.5px | | height 30px, padding 0 20px, border-top 1px, muted; правая группа gap 16px |
| Quick search: ввод | 12.5px | | padding 14px 18px, «⌕» muted, хинт «esc» 10px |
| Quick search: секции | 10px | | uppercase, .12em, muted |
| Quick search: строка | 12.5px | | padding 8px 18px, справа 11px muted (папка/файл/шорткат); активная — `--surface-2` |
| Quick search: подвал | 10.5px | | padding 10px 18px, border-top, gap 16px |

## Геометрия

| Элемент | Значение |
|---------|----------|
| Окно по умолчанию | 1100×720 |
| Title bar | 36px, padding-left 16px; кнопки окна 3×46px (svg 10×10, stroke 1px: «—», «▢», «✕») |
| Рейка (rail) | 232px, border-right 1px, padding 20px 0 16px, секции gap 22px |
| Полоса переключателя режимов | 44px, по центру контента; при свёрнутой рейке слева на 16px — «▸ files» |
| Контент | padding-top 36px; read/rich max-width 560px; edit max-width 640px |
| Статус-бар | 30px |
| Library контент | padding 44px 56px 0; заголовок margin-bottom 28px |
| Quick search модал | width 520px, top 120px, центр по горизонтали, border 1px; фон приложения под ним opacity .35 |
| Каретка | 1.5px × 15px, accent, blink 1.1s steps(1) |
| Скругления | 0 везде (в макетах отсутствуют) |
| Тени | нет (кроме карточек самого макета) |
| Иконки | нет; только глифы-лейблы: ⌕ ◐ ◑ ● • ▸ ↑↓ ↵ ⌃ |

## Состояния и индикаторы

- Изменённый файл: «•» accent в breadcrumbs после имени файла; «●» accent справа от имени в рейке; статус «unsaved»; в библиотеке бейдж «edited».
- Сохранено: статус «saved 2m ago» (относительное время).
- Тема: статус-бар «◐ light» / «◑ dark» — кликабельный переключатель.
- Прогресс чтения: «reading · 38%».
- Позиция каретки в edit: «ln 9, col 118 · markdown»; кодировка «utf-8».
- Выделение в rich: «rich · 3 chars selected».
- Активный пункт рейки: фон `--surface`, цвет fg.
- Активная вкладка режима: fg + подчёркивание 1px.
- Hover-состояния в макетах не заданы → правило: hover = цвет fg без фона; фон только для активного.

## Компоненты рейки (три состояния)

1. **files** (1a/1b): «⌕ search … ctrl k»; группы по папкам (заголовок папки uppercase), файлы; футер «N files · synced».
2. **outline** (1d): «outline» — заголовки с отступом по уровню (H2 → padding-left 36px); «links here» — backlinks; футер-переключатель «outline · files».
3. **library** (1e/1f): «folders» с счётчиками (all/notes/projects/garden), «tags» (#writing…); футер — путь библиотеки «~/Documents/plain».

## Что макеты НЕ показывают (нужно спроектировать в том же стиле)

Настройки, find/replace-панель, диалоги (переименование, подтверждение, конфликт файла), контекстные меню, split view, вкладки/несколько файлов, экспорт, история версий, light-вариант quick search и модалов, dark-вариант плавающего тулбара, состояние пустой библиотеки, состояние «файл не найден», drag-n-drop оверлей, tooltips.
