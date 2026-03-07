# Tasks: video-hh-conservative-commit-inference

## Стратегия тестирования

TDD-by-signal: это parser/preview change с чёткими acceptance критериями, поэтому сначала пишем regression tests, затем implementation.

| Тип | Scope | Файлы |
|-----|-------|-------|
| Unit | conservative commit in extractor | `poker-voice/tests/videoBaselineExtractor.test.js` |
| Unit | focus resolution in preview | `poker-voice/tests/videoLabPreview.test.js` |
| Unit | explainability trace in preview rows | `poker-voice/tests/videoLabPreview.test.js` |
| Static | syntax/check | `poker-voice/package.json` (`npm run check`) |

## Чеклист

### Фаза 0: Подготовка
- [x] Run Clarify Gate и зафиксировать assumptions — `clarify-gate-ff.md`
- [x] Описать design и trade-offs — `design.md`
- [x] Добавить red-тесты на новые инварианты

**Checkpoint:** Подготовка завершена

### Фаза 1: Основная реализация
- [x] Реализовать conservative suppression stale pending preflop actions — `poker-voice/src/videoBaselineExtractor.js`
- [x] Добавить `resolution_state/reason_codes` для inferred events — `poker-voice/src/videoBaselineExtractor.js`
- [x] Реализовать terminal `focus=none` в preview resolver — `poker-voice/src/videoLabPreview.js`
- [x] Заблокировать next-frame focus override для inferred rows — `poker-voice/src/videoLabPreview.js`
- [x] Отрисовать state/reasons в preview table — `poker-voice/src/videoLabPreview.js`
- [x] Добавить explainability trace (observed/decision/past/expected) — `poker-voice/src/videoLabPreview.js`
- [x] Добавить поддержку `--limit` и кастомного html-файла preview — `poker-voice/scripts/video-hh-lab-preview.mjs`

**Checkpoint:** Core функционал работает

### Фаза 2: Интеграция и полировка
- [x] Прогнать targeted unit tests
- [x] Прогнать `npm run check`
- [x] Сгенерировать first-24 explain preview для review — `preview/index-first24-trace.html`
- [x] Обновить verify-lite для кодовой итерации
- [x] Обновить WORKING_STATE

**Checkpoint:** Все тесты проходят, check clean

## Команды проверки
```bash
cd poker-voice
node --test tests/videoBaselineExtractor.test.js tests/videoLabPreview.test.js
node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js tests/videoLabPreview.test.js
npm run check
npm run -s video:preview -- --run "/tmp/video-hh-lab-full-s1-adaptive/video-lab-20260304-224449753-zh2ng6" --limit 24 --out "index-first24-trace.html"
```
