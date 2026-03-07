# Design: video-hh-conservative-commit-inference

## Обзор

Дорабатываем текущий baseline extractor в сторону conservative commit:
- single-frame/single-token action сигналы в preflop response context не должны сразу попадать как committed;
- достроенные через anchor события маркируются `inferred`;
- preview перестаёт делать actor-fallback на terminal hand rows и явно ставит `focus=none`.

Подход intentionally incremental: меняем только extraction/preview слой, без затрагивания OCR helpers и без изменения базового `canonical_hand_v1` обязательного контракта.

## Компоненты

1. `poker-voice/src/videoBaselineExtractor.js`
- расширить suppression stale pending preflop actions (не только raise);
- сохранить/усилить anchor-based insertion (`inferred_preflop_response`);
- прокинуть optional metadata в sanitized events:
  - `resolution_state`
  - `reason_codes`.

2. `poker-voice/src/videoLabPreview.js`
- читать `resolution_state` / `reason_codes`;
- в `resolveFocusActors`:
  - не переопределять focus у `inferred` rows next-frame actor-логикой;
  - задавать `focus=none` на terminal rows.
- добавить визуализацию `State` (и при необходимости reasons).

3. `poker-voice/tests/videoBaselineExtractor.test.js`
- regression test на stale pending preflop `CALL` with stable pot -> inferred near anchor.

4. `poker-voice/tests/videoLabPreview.test.js`
- regression test: terminal row focus = `none`;
- regression test: inferred row keeps actor focus, not next-frame override.

## Модель данных

Без breaking-change:
- обязательные поля `Event` сохраняются;
- optional добавления:
  - `resolution_state: "committed" | "inferred"`
  - `reason_codes: string[]`

## Trade-offs

- **Выбрано:** conservative commit + inferred labeling
  - + ниже риск ложных фактов
  - + QA видит, что событие inferred
  - - возможен рост low-confidence inferred rows

- **Не выбрано:** aggressive auto-commit
  - + выше coverage в short-term
  - - выше false certainty и ручной дебаг

## Риски и митигация

- Риск: inferred rows станут слишком частыми.
  - Митигация: отдельные counters в meta и последующая калибровка порогов.
- Риск: часть старых тестов зависит от старой focus fallback логики.
  - Митигация: обновить тесты на новое инвариантное поведение.
- Риск: терминальность строки иногда неочевидна.
  - Митигация: ограничить правило `focus=none` только на last frame-group hand timeline.

