# Clarify Gate: Iteration 9 (sampling + focus + preview indexing)

## Task

Усилить извлечение событий для минимизации пропусков:
- перейти на baseline `sample-ms=1000`;
- добавить адаптивное досэмплирование по suspicious pot jumps;
- сделать preview-порядок событий сквозным (без сброса per hand);
- записывать `focus_actor` в event evidence и показывать в preview.

## Constraints

- Сохранить совместимость `canonical_hand_v1` и действующих unit-тестов.
- Изменения должны быть локальными для video-HH pipeline (`videoOcrPython`, `videoBaselineExtractor`, `videoLabPreview`, CLI defaults).
- Не добавлять внешние зависимости.

## Decisions

1. Adaptive refine делаем только для Python OCR path:
   - primary pass по `sample-ms`;
   - поиск interval-кандидатов по резкому росту pot;
   - локальный refine-pass в этих интервалах с меньшим шагом;
   - merge кадров по `ms`.
2. В preview добавляем одновременно:
   - `# Global` (monotonic across all hands),
   - `# In Hand` (локальный индекс),
   - `Focus` и `Pot`.
3. `focus_actor` пишем в `event.evidence.focus_actor` (optional), чтобы не ломать контракт.

## Risks

- Увеличение времени OCR из-за refine-pass.
- Возможные дубли кадров после merge.

## Mitigations

- Ограничение количества refine-intervals и кадров per interval.
- Дедуп merge кадров по `ms` с приоритетом более информативного кадра.
