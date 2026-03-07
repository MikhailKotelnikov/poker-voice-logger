# Design: video-hh-contract-lab-kickoff

## Обзор

Wave-1 реализует изолированный contract-lab контур без интеграции в основной server/API путь.
Фокус: зафиксировать `canonical_hand_v1`, обеспечить reproducible run artifacts и baseline-diff метрики по тестовому видео.

Текущая реализация использует OCR baseline через `opencv + rapidocr` (python helper) и fallback на AVFoundation helper. Это дает реальные события на видео уже в Wave-1, но пока с шумом и без room-specific калибровки.

## Компоненты

1. `src/videoContract.js`
- schema-константы
- `validateCanonicalRun(payload)` -> `{ ok, errors, normalized }`

2. `src/videoLabMetrics.js`
- агрегирует baseline vs predicted (`hand_count_delta`, `event_count_delta`, coverage)
- считает malformed statistics (если labels invalid)

3. `src/videoOcrPython.js`
- bridge для python helper
- парсинг JSONL (`meta/frame/warn/error/done`) в структуру для extractor

4. `scripts/video-ocr-helper.py`
- декодирование видео через `opencv`
- OCR каждого sampled frame через `rapidocr`
- эмит структурированных строк с `text/confidence/bbox/cx/cy`

5. `src/videoOcrAvFoundation.js`
- fallback-bridge на Objective-C helper (если python OCR недоступен)

6. `src/videoBaselineExtractor.js`
- OCR line parsing -> canonical events
- actor/action inference (включая action-only строки)
- dedupe и сборка canonical run
- Iteration 2 heuristics:
  - suppress bottom action-button OCR lines,
  - stronger dedupe for persistent action-only overlays (pot-stable),
  - split hands on strong pot reset without waiting long gap,
  - conservative preflop->flop hint from action flow.
- Iteration 6 heuristics:
  - focus-first gate from cue lines (`<actor> is currently deciding`),
  - hard block of actions from folded/all-in players in same hand,
  - squeeze-response-aware preflop street promotion (pending responses must resolve),
  - inferred open-raise recovery path from bottom-seat raise hints when chain indicates missing opener.

7. `src/videoHhDraft.js`
- deterministic adapter canonical hands -> HH draft summary

8. `scripts/video-hh-lab-run.mjs`
- CLI entry:
  - `--video <path>` (required)
  - `--labels <path>` (optional)
  - `--out <dir>` (optional; default `reports/video-hh-lab`)
  - `--sample-ms <n>`
  - `--max-frames <n>`
  - `--strict-extractor`
  - `--preview` (optional visual QA artifacts)
- пишет run-артефакты и выставляет exit code

9. `src/videoLabPreview.js` + `scripts/video-frame-export.py`
- materialize event->frame mapping preview inside run dir:
  - `preview/frames/*.jpg`
  - `preview/index.html`
  - `preview/preview.json`
- designed for operator manual QA without parsing raw JSON

9. `tests/videoContract.test.js`, `tests/videoLabMetrics.test.js`, `tests/videoBaselineExtractor.test.js`
- unit checks for valid/malformed payloads and parser logic

10. `package.json`
- script alias: `video:lab`
- `check` включает новые модули/скрипты

## Модель данных

`canonical_hand_v1` top-level:
- `version: "canonical_hand_v1"`
- `video`:
  - `path`
  - `size_bytes`
  - `created_at`
- `hands: Array<Hand>`
- `meta`:
  - `extractor_stage`
  - `sampled_frames`
  - `raw_event_count`
  - `event_count`

`Hand`:
- `hand_id: string`
- `start_ms: number`
- `end_ms: number`
- `events: Array<Event>`

`Event`:
- `event_id: string`
- `street: "preflop" | "flop" | "turn" | "river" | "unknown"`
- `actor: string`
- `action: string`
- `size_bb: number | null`
- `confidence: number (0..1)`
- `evidence`:
  - `frame_ms: number`
  - `text_raw: string`

## Trade-offs

- **Chosen:** strict schema + real OCR baseline (python) + fallback
  - + реальные `events` на тестовом видео в Wave-1
  - + сохраняется contract-first дисциплина
  - - шумные события и эвристический actor inference

- **Rejected:** ждать “идеальный” extractor до запуска
  - + потенциально чище output
  - - теряем быстрый feedback loop и реальные run-данные

## Риски и митигация

- Риск: OCR шум и дубли действий
  - Митигация: dedupe window + labels-diff + ручная калибровка regex/heuristics

- Риск: отсутствие OCR-зависимостей в новой среде
  - Митигация: README-команда установки + `VIDEO_OCR_PYTHONPATH`

- Риск: смешивание с production данными
  - Митигация: отдельный `reports/video-hh-lab/<run-id>/` и отсутствие DB-write в этом change
