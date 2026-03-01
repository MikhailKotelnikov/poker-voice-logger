# Poker Voice Logger

Локальное web-приложение для ведения покерных `nots` в Google Sheets из двух источников:
- голосовая диктовка (смешанный RU/EN, пользовательские сокращения),
- hand history (PokerTracker/Hand2Note/сырые HH-файлы).

Проект решает три задачи:
1. быстрое занесение заметок в единый формат,
2. массовая конвертация HH в тот же формат заметок,
3. построение визуального профиля оппонента по собранной базе строк.

---

## Что реализовано (актуально)

### 1) Web UI и рабочий поток
- Список **активных оппонентов** (локально, в браузере).
- Добавление/удаление одного оппа (`×`) и `Сбросить активных`.
- Выбор активного оппа кликом по карточке.
- Кнопка `открыть` под каждым оппом: открывает Google Sheet на первой строке этого ника.
- Кнопка `профиль` под каждым оппом: открывает popup с цветовой визуализацией по его строкам.
- Раздел **Запись**: старт/стоп записи с микрофона.
- Раздел **Результат**: транскрипт + разобранные поля (`preflop/flop/turn/river/presupposition`).
- Для каждого поля есть:
  - `передиктовать` (перезаписать только это поле),
  - `сохранить` (ручная правка с клавиатуры в ту же строку Sheets).
- Кнопка `Сохранить репорт`: сохраняет локальный JSONL-репорт для дообучения словаря/спеллингов.

### 2) Голосовой пайплайн (audio -> nots)
- STT через OpenAI (`/v1/audio/transcriptions`).
- Затем semantic LLM-парсер (если включен).
- Fallback на rule-based парсер, если LLM не дал валидный результат.
- Поддержка mixed RU/EN диктовки через `vocab.json` и нормализации.

### 3) Hand History режим (HH -> nots)
- В UI отдельный блок **Hand History**.
- В этом блоке выведены активные игроки как picker цели HH.
- HH вставляется текстом и отправляется на `/api/record-hand-history`.
- HH-записи хранятся только в локальной SQLite БД (`HH_DB_PATH`), без записи во второй лист Google Sheets.
- Можно загрузить сразу несколько HH-файлов (`.txt/.log/.hh`) и разобрать пакетно через `/api/record-hand-history-files`.
- Добавлен пакетный импорт из папки/подпапок с авто-переносом обработанных файлов в отдельный mirror-каталог (`/api/hh-folder-import` + авто-loop по env).
- Дополнительно: кнопка `Визуализировать HH` строит цветную построчную визуализацию одной раздачи (`/api/visualize-hand`).
- На выходе формируется структурная запись в стиле `nots`:
  - позиции с идентификатором игрока (`SB_85033665`, `HJ_spirituallybroken`),
  - сайзинги в `bb`/`%pot`,
  - последовательность действий в порядке HH,
  - board с мастями (`onKc9d6s...`),
  - showdown-карты target/opponent,
  - классы рук и дро по улицам (`_p`, `_2p`, `_str`, `_nutstr`, `_fd`, `_nfd`, `_g`, `_oe`, `_wrap`),
  - условные теги без шоудауна (`Lx`, `Sx`) для профилирования силы линии,
  - локальные интерпретации (`[z]`, `[potctrl]`),
  - без отдельного `sd` токена.

### 4) Формат хранения
- Голосовые записи пишутся в `Sheet1` (или `SHEET_NAME_VOICE`).
- HH-записи пишутся в SQLite (`HH_DB_PATH`).
- Для HH поле `nickname` фиксируется как `HH`, а идентификация игроков остается внутри street-текста (`POS_player`).
- Каждая строка — одна раздача/один структурированный note-entry с полями:
  - `preflop`, `flop`, `turn`, `river`, `presupposition`.

### 5) Семантика и словари
- `NOTS_SEMANTIC_DICTIONARY.md` — канон токенов, правила, спеллинги, контекст.
- `vocab.json` — пользовательские алиасы:
  - `streetAliases`
  - `textAliases`
  - `spellingAliases`
- Канонизация line+sizing, street-маркеров, light-маркеров, композитов руки, локальных интерпретаций.

### 6) Интеграция с Google Sheets (Apps Script)
- Вставка новой строки после последней строки выбранного оппонента.
- Обновление конкретного поля в конкретной строке.
- Поиск первой строки оппонента.
- Поиск/автодополнение ника по всей таблице.
- Форматирование листа под рабочий layout.

### 7) Репорты для итеративного улучшения
- Формат JSONL (`reports/nots_reports.jsonl`).
- Сохраняются:
  - исходная транскрипция,
  - initial parsed,
  - final parsed,
  - все правки (manual/redictate),
  - parser meta (model/confidence/unresolved),
  - opponent/row/session.

### 8) Визуальный профиль: что именно считается
- Профиль строится по тем действиям, где выбранный игрок **сам сделал action**.
- Секции:
  - `Flop Bets` (HU + MW),
  - `BetBet`,
  - `Probes` (HU + MW),
  - `River BetBet`,
  - `River Once`,
  - `BetBetBet`,
  - `TOT`.
- Бакеты сайзинга:
  - `2` (`0..30`), `3` (`30..45`), `5` (`45..55`), `6` (`55..70`), `7` (`70..95`), `P` (`95..105+`), `Miss`.
- Сила руки:
  - `nuts`, `strong`, `conditionalStrong(Sx)`, `fragileStrong` (дисконтированный strong на опасных текстурах), `overpair`, `twoPair`, `topPair`, `strongDraw`, `weakDraw`, `lightFold(Lx)`, `weak`, `unknown`.
- Для `BetBet Miss` сила берется с улицы пропуска:
  - `b-x-x` -> `turn`,
  - `x-b-x` -> `river`.
- Исключение: `Lx` и `Sx` являются line-level метками и могут распространяться на всю линию.
- Raise-мультипликаторы (`r5x`, `r6.2x`) не конвертируются в `%`-сайзинги и не попадают в bucket `2`.
- Tooltip по сэмплам показывает отдельную строку `HANDS` (hero first, затем оппоненты), а карты внутри street-строк не дублируются.
- Для board-дисконтированных strong-комбо в HH-токенах используются компактные маркеры борда без внутренних `_`: `STRB`, `FLB`, `pairedboard`; для low-straight: `lowstr_STRB`.

### 9) Windows launcher и автоимпорт
- Добавлена desktop-оболочка (`desktop/*`) для Windows.
- При старте launcher:
  - поднимает локальный `server.js` как дочерний процесс,
  - разворачивает runtime БД (`%APPDATA%/Poker Voice Launcher/runtime/hh.db`),
  - сохраняет настройки папок автоимпорта в `launcher-config.json`.
- Кнопка `Открыть web-приложение` открывает текущий локальный URL в браузере.

---

## Архитектура (файлы)

- `/Users/parisianreflect/Documents/codex/poker-voice/server.js`
  - HTTP API, STT, semantic routing, запись в Sheets, кэш/сборка профилей.
- `/Users/parisianreflect/Documents/codex/poker-voice/src/core.js`
  - rule-based parsing и нормализация текста.
- `/Users/parisianreflect/Documents/codex/poker-voice/src/semantic.js`
  - разбор и валидация JSON-ответов LLM.
- `/Users/parisianreflect/Documents/codex/poker-voice/src/handHistory.js`
  - детерминированный парсинг HH: позиции, поты, board, showdown, классы, итоговые street-ноты, условные `Lx/Sx`.
- `/Users/parisianreflect/Documents/codex/poker-voice/src/reports.js`
  - санитизация и запись training reports.
- `/Users/parisianreflect/Documents/codex/poker-voice/src/visualProfile.js`
  - агрегация и классификация профилей по секциям/бакетам/силе.
- `/Users/parisianreflect/Documents/codex/poker-voice/src/handVisual.js`
  - UI-модель визуализации одной HH-раздачи (по улицам и участникам).
- `/Users/parisianreflect/Documents/codex/poker-voice/src/hhDb.js`
  - SQLite schema/insert/query для HH, import runs, dedupe и профильных выборок.
- `/Users/parisianreflect/Documents/codex/poker-voice/public/index.html`
- `/Users/parisianreflect/Documents/codex/poker-voice/public/app.js`
- `/Users/parisianreflect/Documents/codex/poker-voice/public/styles.css`
  - UI/UX.
- `/Users/parisianreflect/Documents/codex/poker-voice/desktop/main.cjs`
  - desktop launcher: runtime config, DB bootstrap, server lifecycle.
- `/Users/parisianreflect/Documents/codex/poker-voice/desktop/preload.cjs`
  - безопасный IPC bridge для UI launcher.
- `/Users/parisianreflect/Documents/codex/poker-voice/desktop/ui/*`
  - UI настройки host/port/auto-import + запуск web app.
- `/Users/parisianreflect/Documents/codex/poker-voice/apps_script/Code.gs`
  - вебхук/формат/операции Google Sheets.
- `/Users/parisianreflect/Documents/codex/poker-voice/tests/*.test.js`
  - unit-тесты core/semantic/handHistory/reports.

---

## API (локально)

- `GET /api/health`
- `GET /api/opponent-suggestions` (merged DB + Sheets; работает даже без `SHEETS_WEBHOOK_URL`)
- `GET /api/open-link?opponent=...`
- `GET /api/opponent-visual-profile?opponent=...&force=1&source=all|voice|hh` (HH читается из SQLite)
- `POST /api/visualize-hand` (HH visual preview)
- `POST /api/record` (audio)
- `POST /api/record-field` (audio + field + row, optional `sheetName`)
- `POST /api/update-field-text` (manual edit, optional `sheetName`)
- `POST /api/record-hand-history` (HH text)
- `POST /api/record-hand-history-files` (multipart batch upload files)
- `GET /api/hh-folder-import-status` (статус inbox-импорта)
- `POST /api/hh-folder-import` (ручной прогон импорта папки/подпапок)
- `POST /api/save-report`

---

## Ключевые правила Hand History

- Префлоп сайзинги -> `bb`.
- Постфлоп ставки/рейзы -> `%pot`.
- В showdown-спотах:
  - `showed` только для добровольного показа,
  - при обязательном showdown просто используются карты в street-ноте (без `sd`).
- Рука и board добавляются в street-запись.
- Для nut-straight используется `nutstr` (где определяется детерминированно).
- Для `fd`/`nfd` в PLO обязательно:
  - на текущей улице на борде уже есть минимум 2 карты одной масти,
  - у игрока есть минимум 2 карты этой масти в руке.
  - На rainbow-флопе (`3 разные масти`) `fd` не ставится.
- Локальные интерпретации:
  - turn `x` с `nutstr` в x/x-линии -> `[z]`,
  - river `x` на спаренном борде -> `[potctrl]`.

---

## Ключевые правила visual profile

- В профиль попадают только целевые действия игрока.
- Для multiway на флопе/пробах используется фактическое число активных актеров в street-line.
- Tooltip всегда содержит полный контекст (`preflop/flop/turn/river`) и все сэмплы без скрытого лимита.
- Для no-showdown линия не принудительно weak: используется `unknown` либо условные `Lx/Sx` при валидных паттернах.
- При showdown явные hand-class токены (`set`, `2p`, `full`, `str`, draw-теги) имеют приоритет над fallback-категориями.

---

## Быстрый старт

1. Установка:

```bash
cd /Users/parisianreflect/Documents/codex/poker-voice
npm install
```

2. Переменные:

```bash
cp .env.example .env
```

Минимум:
- `OPENAI_API_KEY`
- `SHEETS_WEBHOOK_URL`

Рекомендуется:
- `OPENAI_MODEL=gpt-4o-transcribe`
- `OPENAI_LANGUAGE=` (пусто для auto mixed)
- `NOTS_SEMANTIC_ENABLED=1`
- `NOTS_SEMANTIC_MODEL=gpt-5.3`
- `NOTS_SEMANTIC_MODEL_FALLBACKS=gpt-5.2,gpt-5`
- `NOTS_SEMANTIC_DICTIONARY_PATH=/Users/parisianreflect/Documents/codex/poker-voice/NOTS_SEMANTIC_DICTIONARY.md`
- `SHEET_URL=...`
- `SHEET_NAME_VOICE=Sheet1` (лист для голосовых нотсов)
- `HH_DB_PATH=/Users/parisianreflect/Documents/codex/poker-voice/data/hh.db` (SQLite для HH)
- `HH_PARSER_MODE=deterministic` (конвертация HH без LLM; `semantic` оставлен как опция)
- `HH_PARSER_VERSION=hh_v2`
- `HH_IMPORT_ENABLED=1` (авто-импорт папки на сервере)
- `HH_IMPORT_INBOX_DIR=C:\\Poker\\HH\\AutoImport\\inbox`
- `HH_IMPORT_IMPORTED_DIR=C:\\Poker\\HH\\AutoImport\\imported`
- `HH_IMPORT_INTERVAL_SEC=60`
- `SHEET_NAME=...` (legacy fallback для voice, если не задан `SHEET_NAME_VOICE`)
- `REPORTS_PATH=/Users/parisianreflect/Documents/codex/poker-voice/reports/nots_reports.jsonl`

### Windows (тестовый режим автоимпорта HH)
1. Установить Node.js LTS.
2. Скопировать проект и `.env` на Windows-машину.
3. Настроить:
   - `HH_DB_PATH` (например, `C:\\PokerVoice\\data\\hh.db`)
   - `HH_IMPORT_ENABLED=1`
   - `HH_IMPORT_INBOX_DIR` (папка, куда кладешь новые HH, поддерживаются подпапки)
   - `HH_IMPORT_IMPORTED_DIR` (папка для уже обработанных файлов, структура подпапок сохраняется)
4. Запустить `npm run dev`.
5. Сервер будет периодически:
   - искать новые HH-файлы в inbox,
   - конвертировать и писать в SQLite,
   - дедуплицировать раздачи по `room+hand_number+parser_version`,
   - переносить обработанные файлы в imported.

### Windows installer (launcher + embedded server)
Теперь доступна desktop-оболочка для Windows через Electron:
- разворачивает runtime-папку и SQLite БД при первом запуске,
- дает UI для `auto-import inbox/imported`,
- поднимает локальный сервер и открывает web-приложение кнопкой.

Сборка инсталлятора:

```bash
cd /Users/parisianreflect/Documents/codex/poker-voice
npm install
npm run desktop:dist:win
```

Результат:
- `dist/*.exe` — установщик (NSIS).

Локальный запуск launcher (без сборки):

```bash
npm run desktop:dev
```

Обновление версий:
- новая сборка ставится поверх существующей (тот же `appId`),
- данные и БД остаются в `%APPDATA%/Poker Voice Launcher/runtime`.

### CLI импорт HH из папки (рекурсивно)

Один запуск (Mac/Windows):

```bash
cd /Users/parisianreflect/Documents/codex/poker-voice
npm run hh:import -- --input "/absolute/path/to/import" --imported "/absolute/path/to/imported"
```

Скрипт:
- проверяет, запущен ли локальный API,
- при необходимости поднимает `server.js`,
- обрабатывает все `.txt/.log/.hh` во всех подпапках,
- сохраняет результат в SQLite,
- переносит обработанные файлы в `imported` с сохранением структуры подпапок,
- дедуплицирует руки по `room+hand_number+parser_version`,
- считает пустые/неэкшеновые руки отдельно как `skippedEmptyHands` (не как `failedHands`),
- удаляет пустые подпапки (и `.DS_Store`) из `import` после успешного прогона,
- по умолчанию не обрывает HTTP-запрос импорта по таймауту (`--request-timeout-ms 0`).
- лимит строк профиля HH настраивается через `HH_PROFILE_ROWS_DEFAULT` и `HH_PROFILE_ROWS_MAX` (по умолчанию `50000` / `500000`).

Логи runtime (JSONL):
- импорт HH: `/Users/parisianreflect/Documents/codex/poker-voice/logs/hh-import.log`
- построение профиля: `/Users/parisianreflect/Documents/codex/poker-voice/logs/visual-profile.log`

На Windows можно запускать shortcut:

```bat
hh-import.cmd "C:\Poker\HH\import" "C:\Poker\HH\imported"
```

### Pipeline между Windows и Mac (OneDrive)

Единый запуск:

```bash
cd /Users/parisianreflect/Documents/codex/poker-voice
npm run hh:onedrive
```

Что делает команда `hh:onedrive`:
1. Берет все файлы и подпапки из OneDrive `import` (`~/Library/CloudStorage/OneDrive-Personal/import`).
2. Перемещает их в локальную inbox-папку проекта (`/Users/.../Documents/codex/import`) с сохранением структуры.
3. Запускает обычный `hh:import` по локальной inbox.
4. Конвертирует HH в SQLite.
5. Переносит обработанные файлы в локальную `/Users/.../Documents/codex/imported`.
6. Переносит все из локальной `/Users/.../Documents/codex/imported` во внешний архив `/Users/.../Documents/imported`.
7. Чистит пустые директории в OneDrive `import` и локальной временной `imported`.

Если нужны свои пути:

```bash
npm run hh:onedrive -- \
  --onedrive-input "/Users/<you>/Library/CloudStorage/OneDrive-Personal/import" \
  --local-input "/Users/<you>/Documents/codex/import" \
  --local-imported "/Users/<you>/Documents/codex/imported" \
  --archive-imported "/Users/<you>/Documents/imported"
```

Если нужен явный таймаут импорта:

```bash
npm run hh:onedrive -- --request-timeout-ms 600000
```

`0` означает без таймаута (дефолт).

### Сброс HH DB

```bash
cd /Users/parisianreflect/Documents/codex/poker-voice
rm -f data/hh.db data/hh.db-shm data/hh.db-wal
```

3. Запуск:

```bash
npm run dev
```

Открыть: `http://127.0.0.1:8787`

---

## Проверка

```bash
cd /Users/parisianreflect/Documents/codex/poker-voice
npm run verify
```

Проверяются:
- синтаксис (`server.js`, `public/app.js`, `src/*.js`),
- тесты (`tests/core.test.js`, `tests/semantic.test.js`, `tests/handHistory.test.js`, `tests/reports.test.js`).

---

## Настройка Google Sheets (Apps Script)

1. Google Sheet -> `Extensions -> Apps Script`.
2. Вставить код из `/Users/parisianreflect/Documents/codex/poker-voice/apps_script/Code.gs`.
3. `Deploy -> New deployment -> Web app`.
4. Настройки:
   - Execute as: `Me`
   - Access: `Anyone with the link`
5. URL веб-приложения вставить в `.env` как `SHEETS_WEBHOOK_URL`.

Если менялся `Code.gs`, нужен redeploy новой версии.
