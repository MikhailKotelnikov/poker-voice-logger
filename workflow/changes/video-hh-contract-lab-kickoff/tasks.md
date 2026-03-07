# Tasks: video-hh-contract-lab-kickoff

## Стратегия тестирования

TDD-by-signal: критерии контракта и метрик четкие, поэтому сначала пишем unit-тесты на validator/metrics/parser, потом реализацию.

| Тип | Scope | Файлы |
|-----|-------|-------|
| Unit | Canonical video schema validation | `poker-voice/tests/videoContract.test.js` |
| Unit | Baseline diff metrics + malformed labels | `poker-voice/tests/videoLabMetrics.test.js` |
| Unit | OCR line -> event parsing and dedupe | `poker-voice/tests/videoBaselineExtractor.test.js` |
| CLI smoke | Run artifact generation on test video | `poker-voice/scripts/video-hh-lab-run.mjs` |

## Чеклист

### Фаза 0: Подготовка
- [x] Добавить тесты для validator и metrics (включая malformed fixture)
- [x] Зафиксировать структуру run artifacts
- [x] Добавить тесты parser/dedupe для baseline extractor

**Checkpoint:** Подготовка завершена

### Фаза 1: Основная реализация
- [x] Реализовать `videoContract` validator — `poker-voice/src/videoContract.js`
- [x] Реализовать `videoLabMetrics` aggregator — `poker-voice/src/videoLabMetrics.js`
- [x] Реализовать `videoHhDraft` adapter — `poker-voice/src/videoHhDraft.js`
- [x] Реализовать baseline extractor orchestration — `poker-voice/src/videoBaselineExtractor.js`
- [x] Реализовать Python OCR bridge (`opencv + rapidocr`) — `poker-voice/src/videoOcrPython.js`
- [x] Реализовать OCR helper (`python`) — `poker-voice/scripts/video-ocr-helper.py`
- [x] Обновить CLI `video-hh-lab-run` (sample/maxFrames/strictExtractor/fallback) — `poker-voice/scripts/video-hh-lab-run.mjs`

**Checkpoint:** Core функционал работает

### Фаза 2: Интеграция и полировка
- [x] Подключить npm script + syntax checks — `poker-voice/package.json`
- [x] Обновить README инструкцией по запуску baseline OCR lab
- [x] Прогнать verify-lite (targeted tests + check + CLI smoke)

**Checkpoint:** Все тесты проходят, lint/check clean

### Фаза 3: Iteration 2 (снижение OCR-шума)
- [x] Run Clarify Gate для extractor noise-reduction — `workflow/changes/video-hh-contract-lab-kickoff/clarify-gate-iter2.md`
- [x] Добавить red-тесты на bottom action buttons, persistent overlays, pot-reset split, flop inference
- [x] Обновить `videoBaselineExtractor` под новые эвристики и пройти green
- [x] Прогнать smoke на предоставленном MP4 и сравнить качество

**Checkpoint:** Noise уменьшен, контур остается contract-compatible

### Фаза 4: Iteration 3 (визуальный preview для ручной QA)
- [x] Run Clarify Gate для preview UX — `workflow/changes/video-hh-contract-lab-kickoff/clarify-gate-iter3-preview.md`
- [x] Добавить генерацию JPEG-кадров по event timestamps (`video-frame-export.py`)
- [x] Добавить HTML preview-отчет (`src/videoLabPreview.js`)
- [x] Подключить `--preview` в `video-hh-lab-run.mjs` + отдельную команду `video:preview`
- [x] Прогнать smoke и подтвердить появление `preview/index.html` и `preview/frames/*`

**Checkpoint:** Пользователь может валидировать extraction визуально без чтения raw JSON

### Фаза 5: Iteration 4 (фиксация user-review ошибок в правила)
- [x] Зафиксировать построчный feedback пользователя по preview run — `user-feedback-iter4-2026-03-04.md`
- [x] Выделить классы ошибок (false negatives/false positives/timing/context)
- [x] Добавить reusable rules в `rules/*.md` по новым классам ошибок
- [x] Обновить `rules/INDEX.md`

**Checkpoint:** Ошибки формализованы, правила готовы к следующему extractor-pass

### Фаза 6: Iteration 5 (focus-first clarification)
- [x] Зафиксировать пользовательский addendum: focus ownership важнее timestamp drift
- [x] Ужесточить правило turn-indicator до gating semantics
- [x] Добавить отдельное правило focus-first (ring + timebar)
- [x] Обновить `rules/INDEX.md`

**Checkpoint:** Приоритет сигналов зафиксирован: сначала focus, потом action text

### Фаза 7: Iteration 6 (extractor implementation of rules 96-100)
- [x] Имплементировать `focus-first` gate по cue-строкам (`is currently deciding`)
- [x] Добавить per-hand player-state constraints (block actions after fold/all-in)
- [x] Добавить preflop squeeze-chain safeguard в street-promotion logic
- [x] Добавить/обновить unit-тесты под новые эвристики
- [x] Прогнать smoke-run с preview на том же видео

**Checkpoint:** Устранены повторные postfold-экшены и восстановлен ранний preflop raise

### Фаза 8: Iteration 7 (pot/stack-priority refinement)
- [x] Run Clarify Gate для pot/stack-priority pass — `clarify-gate-iter7-pot-stack-priority.md`
- [x] Добавить stale pending preflop aggression suppression без роста pot
- [x] Добавить inference missing squeeze-response calls before flop
- [x] Нормализовать postflop semantics (`bet` vs `raise`, `call_allin`)
- [x] Добавить/обновить unit-тесты под эти кейсы
- [x] Прогнать smoke-run и подтвердить удаление `AbbyMartin raise @26000`
- [x] Зафиксировать новые правила 101-102 и обновить `rules/INDEX.md`

**Checkpoint:** Action-инференс смещен к состоянию банка/очереди, шум текстовых лейблов дополнительно снижен

### Фаза 9: Iteration 8 (pre-roll ordering + full-video pass)
- [x] Исправить pre-roll reorder при одинаковом timestamp (`0ms`) через tie-break priority
- [x] Добавить unit-тест на deterministic pre-roll fold-before-raise ordering
- [x] Прогнать targeted verify (`videoContract`, `videoLabMetrics`, `videoBaselineExtractor`) + `npm run check`
- [x] Прогнать full-video extraction для user-review (`sample-ms=5000`, `max-frames=400`, `--preview`)
- [x] Зафиксировать новое reusable-rule в `rules/*` и обновить `rules/INDEX.md`

**Checkpoint:** Полный прогон по видео сформирован, user-review может идти по всем детектированным раздачам

### Фаза 10: Iteration 9 (1s baseline + adaptive refine + preview QA context)
- [x] Run Clarify Gate для sampling/focus/preview pass — `clarify-gate-iter9-sampling-focus-preview.md`
- [x] Перевести baseline sampling на `sample-ms=1000` по умолчанию
- [x] Добавить adaptive refine для Python OCR-pass на подозрительных скачках банка
- [x] Добавить проброс `focus_actor` в event evidence для ручной QA
- [x] Перевести preview-нумерацию на сквозной global index (без reset per hand)
- [x] Добавить `Focus` и `Pot` колонки в preview-таблицу
- [x] Добавить unit-тесты: focus persistence + preview global indexing/focus export
- [x] Прогнать verify-lite + smoke preview run на пользовательском видео
- [x] Зафиксировать новые reusable rules 104-105 и обновить `rules/INDEX.md`

**Checkpoint:** QA-артефакты теперь дают непрерывную нумерацию и turn-focus контекст; sampling ориентирован на минимизацию пропусков

## Команды проверки
```bash
cd poker-voice
node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js
npm run check
npm run video:lab -- --video "/Users/parisianreflect/Documents/codex/20260303-1610-37.8875770.mp4" --out "/tmp/video-hh-lab-smoke"
```
