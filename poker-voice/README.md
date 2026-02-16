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
- `OPENAI_MODEL` (рекомендуется `gpt-4o-transcribe`)
- `OPENAI_LANGUAGE` (оставь пустым для автоопределения mixed RU/EN)
- `OPENAI_PROMPT` (инструкция для ASR на ASCII/шорткоды)
- `NOTS_SEMANTIC_ENABLED` (`1` чтобы включить LLM-семантику после STT)
- `NOTS_SEMANTIC_MODEL` (primary, например `gpt-5.3`)
- `NOTS_SEMANTIC_MODEL_FALLBACKS` (через запятую, например `gpt-5.2,gpt-5`)
- `NOTS_SEMANTIC_DICTIONARY_PATH` (путь до semantic-словаря)
- `SHEETS_WEBHOOK_URL` (если используешь Apps Script)
- `SHEET_URL` (ссылка на таблицу вида `https://docs.google.com/spreadsheets/d/.../edit`, нужна для кнопки `Открыть`)
- `SHEET_NAME` (опционально, если лист не активный)
- `VOCAB_PATH` (опционально, путь до JSON-словаря)
- `REPORTS_PATH` (куда сохранять training-reports, по умолчанию `./reports/nots_reports.jsonl`)

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
- синтаксис `server.js`, `public/app.js`, `src/core.js`, `src/semantic.js`
- unit-тесты парсера и semantic-утилит (`tests/core.test.js`, `tests/semantic.test.js`)

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

## Семантический режим (свободная диктовка)

Теперь в `/api/record` есть 2 этапа:

1. STT: аудио -> текст.
2. Semantic LLM parser: текст -> `preflop/flop/turn/river/presupposition`.

Если LLM-парсер выключен или не дал валидный результат, сервер делает fallback на старый маркерный парсер (`флоп/терн/ривер/...`).

Если primary-модель недоступна в API-аккаунте, сервер автоматически пробует модели из `NOTS_SEMANTIC_MODEL_FALLBACKS`.

Semantic-словарь хранится в:
- `/Users/parisianreflect/Documents/codex/poker-voice/NOTS_SEMANTIC_DICTIONARY.md`

Этот файл используется как знание для конвертации свободной речи в каноничный формат `nots`.

## Пользовательский словарь

В проекте есть файл `/Users/parisianreflect/Documents/codex/poker-voice/vocab.json`.

Поля:

- `streetAliases`: какие голосовые фразы считать какой улицей
- `textAliases`: какие фразы заменять в результирующем тексте
- `spellingAliases`: отдельный слой spoken/spelling-вариантов (сверяется на каждом прогоне до и после mixed-language нормализации)

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

1. `A`: nickname (white, wrap включен, текст не вылезает за границы колонки)
2. `B:C`: preflop block (white), запись идет в `B`, `C` — запас
3. `D:F`: flop block (light yellow), запись идет в `D`, `E:F` — запас
4. `G:I`: turn block (light blue/lilac), запись идет в `G`, `H:I` — запас
5. `J:L`: river block (white), запись идет в `J`, `K:L` — запас
6. `M`: presuppositions block (light pink)
7. `N:Q`: пустой отступ
8. `R`: date (автоматическое `дата-время` создания записи)
9. Ширина всех колонок: `3 см` (приблизительно `113 px`)

После каждого блока одного оппонента автоматически добавляется пустая строка для визуального разделения.

Все строки с данными принудительно форматируются как `normal` (не жирные).

Кнопка `Открыть` под никнеймом открывает Google Sheet на первой строке, где встречается этот ник.

Поле добавления никнейма:
- один раз при запуске подгружает индекс никнеймов из Google Sheets
- показывает подсказки только когда начинаешь печатать
- поиск идет по всей колонке `nickname` в Sheets, а не по локальному активному списку

В карточках оппонентов:
- `×` в правом верхнем углу удаляет оппонента из активного локального списка
- `Сбросить активных` очищает весь локальный список оппонентов

В блоке `Разбор` у каждого поля есть кнопка `передиктовать`:
- она записывает только выбранное поле (`preflop/flop/turn/river/presupposition`)
- правка пишется в уже сохраненную строку Google Sheets (без добавления новой строки)

Кнопка `Сохранить репорт` в блоке `Результат`:
- сохраняет JSONL-report для анализа качества распознавания и пополнения словаря
- в report попадает: исходная транскрипция, первичный parse, финальные правки, история правок (передиктовка/ручная правка), row/opponent
- файл накапливается локально в `REPORTS_PATH` (можно потом прикреплять в чат для разбора)

## Если формат не применился

1. Вставь актуальный код из `/Users/parisianreflect/Documents/codex/poker-voice/apps_script/Code.gs`.
2. В Apps Script запусти функцию `setupSheetLayout()` один раз (кнопка `Run`).
3. Сделай redeploy Web App с новой версией.
4. Проверь, что `SHEETS_WEBHOOK_URL` в `/Users/parisianreflect/Documents/codex/poker-voice/.env` указывает на этот deployment.
