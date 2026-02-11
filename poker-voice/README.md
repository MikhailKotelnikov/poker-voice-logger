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
- `SHEETS_WEBHOOK_URL` (если используешь Apps Script)
- `SHEET_NAME` (опционально, если лист не активный)
- `VOCAB_PATH` (опционально, путь до JSON-словаря)

4. Запустить:

```bash
npm run dev
```

Открой `http://localhost:8787`.

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

## Колонки таблицы

1. opponent
2. preflop
3. flop
4. turn
5. river
6. presupposition
7. timing

`timing` сейчас проставляется автоматически (ISO‑время). Если нужно другое поведение — скажи.
