# Poker Voice Logger

Локальный web‑интерфейс для диктовки улиц и пресуппозиции с записью в Google Sheets.

## Быстрый старт

1. Установить зависимости:

```bash
cd /Users/parisianreflect/Documents/codex/poker-voice
npm install
```

2. Создать `.env` по примеру:

```bash
cp .env.example .env
```

3. Заполнить переменные:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (рекомендуется `gpt-4o-mini-transcribe`)
- `OPENAI_LANGUAGE` (`en` для англ. токенов)
- `OPENAI_PROMPT` (инструкция для ASR на ASCII/шорткоды)
- `SHEETS_WEBHOOK_URL` (если используешь Apps Script)
- `SHEET_URL` (ссылка на таблицу вида `https://docs.google.com/spreadsheets/d/.../edit`, нужна для кнопки `Открыть`)
- `SHEET_NAME` (опционально, если лист не активный)
- `VOCAB_PATH` (опционально, путь до JSON-словаря)

4. Запустить:

```bash
npm run dev
```

Открой `http://localhost:8787`.

## Проверка проекта

Один командой:

```bash
cd /Users/parisianreflect/Documents/codex/poker-voice
npm run verify
```

Что проверяется:
- синтаксис `server.js`, `public/app.js`, `src/core.js`
- unit-тесты парсера и генерации ссылок (`tests/core.test.js`)

Если порт занят, можно поменять в `.env`:

```bash
PORT=8787
HOST=127.0.0.1
```

## Google Sheets через Apps Script (самый простой путь)

1. Открой нужную Google‑таблицу.
2. `Расширения → Apps Script`.
3. Вставь код из `/Users/parisianreflect/Documents/codex/poker-voice/apps_script/Code.gs`.
4. `Deploy → New deployment → Web app`.
5. Выполни настройки:
   - Execute as: **Me**
   - Who has access: **Anyone with the link**
6. Скопируй URL веб‑приложения и вставь в `SHEETS_WEBHOOK_URL`.

> Скрипт вставляет новую строку сразу после последней записи выбранного оппонента.
>
> Если ты обновил код `Code.gs`, обязательно: `Deploy -> Manage deployments -> Edit -> Select version -> Deploy` (новая версия).

## Формат диктовки

- Улица произносится как маркер: `флоп`, `терн`, `ривер`, `пресуппозиция`.
- В ячейки записывается только текст после маркера.
- Presupposition идёт в той же записи после улиц.

Пример: `флоп 33 + 2x trib, терн xr100, ривер ф1 vs75, пресуппозиция reago vsmy rcb`.

## Пользовательский словарь

В проекте есть файл `/Users/parisianreflect/Documents/codex/poker-voice/vocab.json`.

Поля:

- `streetAliases`: какие голосовые фразы считать какой улицей
- `textAliases`: какие фразы заменять в результирующем тексте

Пример:

```json
{
  "streetAliases": {
    "первая улица": "flop"
  },
  "textAliases": {
    "ставка 33%": "bet33"
  }
}
```

С фразой `первая улица ставка 33%` результат будет: в колонке `flop` запишется `bet33`.

Текущий `vocab.json` уже содержит базовые термины:
- `нулевая улица -> preflop`
- `первая улица -> flop`
- `вторая улица -> turn`
- `третья улица -> river`
- `пресуппозиция -> presupposition`
- `я -> i`, `агро -> agro`, `слабая -> l1`, `ставка -> b`, `двойная ставка -> bb`, `тройная ставка -> bbb`

## Колонки таблицы

1. `A`: nickname (white)
2. `B`: preflop (white)
3. `C:E`: flop block (light yellow), text in `C`, `D:E` left empty for visual overflow
4. `F:H`: turn block (light blue/lilac), text in `F`, `G:H` left empty
5. `I:K`: river block (white), text in `I`, `J:K` left empty
6. `L`: presuppositions block (light pink)
7. Ширина всех колонок: `3 см` (приблизительно `113 px`)

Текст не обрезается в первой ячейке блока: за счет пустых соседних ячеек и отключенного wrap он визуально продолжается на соседние колонки, как в примере.

Кнопка `Открыть` под никнеймом открывает Google Sheet на первой строке, где встречается этот ник.

В блоке `Разбор` у каждого поля есть кнопка `передиктовать`:
- она записывает только выбранное поле (`preflop/flop/turn/river/presupposition`)
- правка пишется в уже сохраненную строку Google Sheets (без добавления новой строки)

## Если формат не применился

1. Вставь актуальный код из `/Users/parisianreflect/Documents/codex/poker-voice/apps_script/Code.gs`.
2. В Apps Script запусти функцию `setupSheetLayout()` один раз (кнопка `Run`).
3. Сделай redeploy Web App с новой версией.
4. Проверь, что `SHEETS_WEBHOOK_URL` в `/Users/parisianreflect/Documents/codex/poker-voice/.env` указывает на этот deployment.
