# Poker Voice Logger

Локальное web-приложение для записи покерных `nots` в Google Sheets из:
- голосовой диктовки,
- hand history (PokerTracker/Hand2Note).

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
- В этом блоке выведены активные игроки как отдельный picker цели HH.
- HH вставляется текстом и отправляется на `/api/record-hand-history`.
- HH-записи пишутся в отдельный лист (по умолчанию `Sheet2` через `SHEET_NAME_HAND_HISTORY`).
- Можно загрузить сразу несколько HH-файлов (`.txt/.log/.hh`) и разобрать пакетно через `/api/record-hand-history-files`.
- Дополнительно: кнопка `Визуализировать HH` строит цветную построчную визуализацию одной раздачи (`/api/visualize-hand`).
- На выходе формируется структурная запись в стиле `nots`:
  - позиции (`SB/BB/CO/...`) и маркер target-позиции `_HE` (например `HJ_HE`),
  - сайзинги в `bb`/`%pot`,
  - последовательность действий в порядке HH,
  - board с мастями (`onKc9d6s...`),
  - showdown-карты target/opponent,
  - классы рук и дро по улицам (`_p`, `_2p`, `_str`, `_nutstr`, `_fd`, `_nfd`, `_g`, `_oe`, `_wrap`),
  - локальные интерпретации (`[z]`, `[potctrl]`),
  - без отдельного `sd` токена.

### 4) Семантика и словари
- `NOTS_SEMANTIC_DICTIONARY.md` — канон токенов, правила, спеллинги, контекст.
- `vocab.json` — пользовательские алиасы:
  - `streetAliases`
  - `textAliases`
  - `spellingAliases`
- Канонизация line+sizing, street-маркеров, light-маркеров, композитов руки, локальных интерпретаций.

### 5) Интеграция с Google Sheets (Apps Script)
- Вставка новой строки после последней строки выбранного оппонента.
- Обновление конкретного поля в конкретной строке.
- Поиск первой строки оппонента.
- Поиск/автодополнение ника по всей таблице.
- Форматирование листа под рабочий layout.

### 6) Репорты для итеративного улучшения
- Формат JSONL (`reports/nots_reports.jsonl`).
- Сохраняются:
  - исходная транскрипция,
  - initial parsed,
  - final parsed,
  - все правки (manual/redictate),
  - parser meta (model/confidence/unresolved),
  - opponent/row/session.

---

## Архитектура (файлы)

- `/Users/parisianreflect/Documents/codex/poker-voice/server.js`
  - HTTP API, STT, semantic routing, запись в Sheets.
- `/Users/parisianreflect/Documents/codex/poker-voice/src/core.js`
  - rule-based parsing и нормализация текста.
- `/Users/parisianreflect/Documents/codex/poker-voice/src/semantic.js`
  - разбор и валидация JSON-ответов LLM.
- `/Users/parisianreflect/Documents/codex/poker-voice/src/handHistory.js`
  - детерминированный парсинг HH: позиции, поты, board, showdown, классы, итоговые street-ноты.
- `/Users/parisianreflect/Documents/codex/poker-voice/src/reports.js`
  - санитизация и запись training reports.
- `/Users/parisianreflect/Documents/codex/poker-voice/public/index.html`
- `/Users/parisianreflect/Documents/codex/poker-voice/public/app.js`
- `/Users/parisianreflect/Documents/codex/poker-voice/public/styles.css`
  - UI/UX.
- `/Users/parisianreflect/Documents/codex/poker-voice/apps_script/Code.gs`
  - вебхук/формат/операции Google Sheets.
- `/Users/parisianreflect/Documents/codex/poker-voice/tests/*.test.js`
  - unit-тесты core/semantic/handHistory/reports.

---

## API (локально)

- `GET /api/health`
- `GET /api/opponent-suggestions`
- `GET /api/open-link?opponent=...`
- `GET /api/opponent-visual-profile?opponent=...` (по умолчанию объединяет `voice + hh` листы)
- `POST /api/visualize-hand` (HH visual preview)
- `POST /api/record` (audio)
- `POST /api/record-field` (audio + field + row, optional `sheetName`)
- `POST /api/update-field-text` (manual edit, optional `sheetName`)
- `POST /api/record-hand-history` (HH text)
- `POST /api/record-hand-history-files` (multipart batch upload files)
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
- `SHEET_NAME_HAND_HISTORY=Sheet2` (лист для HH-нотсов)
- `SHEET_NAME=...` (legacy fallback, если не заданы *_VOICE / *_HAND_HISTORY)
- `REPORTS_PATH=/Users/parisianreflect/Documents/codex/poker-voice/reports/nots_reports.jsonl`

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
