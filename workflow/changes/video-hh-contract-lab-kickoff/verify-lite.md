## Verify-lite

| Проверка | Статус |
|----------|--------|
| Tasks: 11/11 | ✓ |
| Критерии: 5/5 | ✓ |
| Тесты | ✓ passing (`node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js`) |
| Check | ✓ clean (`npm run check`) |
| CLI smoke | ✓ passing (`npm run video:lab -- --video ... --strict-extractor`) |

### Notes
- Representative fixtures: valid canonical payload + malformed labels payload + parser/dedupe unit cases.
- Manual visualization smoke-check: not applicable (no UI changes).
- Smoke run (sample-ms=5000, max-frames=5) on provided video returned real output: `predicted_hands=1`, `predicted_events=19`, `extractor_stage=baseline_ocr_python`.

## Verify-lite (Iteration 2)

| Проверка | Статус |
|----------|--------|
| Clarify Gate (iter2) | ✓ (`clarify-gate-iter2.md`) |
| Тесты | ✓ passing (`node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js`) |
| Check | ✓ clean (`npm run check`) |
| CLI smoke (same params pre/post) | ✓ noise reduced |

### Notes (Iteration 2)
- Added representative parser fixtures for: bottom action-button suppression, persistent action-only overlays, pot-reset hand split, conservative preflop->flop inference.
- Manual visualization smoke-check: not applicable (no UI changes).
- Smoke comparison on provided video with same params (`sample-ms=2000`, `max-frames=30`):
  - before: `predicted_hands=1`, `predicted_events=37`
  - after: `predicted_hands=1`, `predicted_events=11`

## Verify-lite (Iteration 3: Preview UX)

| Проверка | Статус |
|----------|--------|
| Clarify Gate (iter3) | ✓ (`clarify-gate-iter3-preview.md`) |
| Check | ✓ clean (`npm run check`) |
| Тесты | ✓ passing (`node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js`) |
| CLI smoke with preview | ✓ passing |

### Notes (Iteration 3)
- Smoke run command: `npm run video:lab -- --video ... --sample-ms 2000 --max-frames 30 --preview --strict-extractor`
- Result run dir: `/tmp/video-hh-lab-iter2-preview/video-lab-20260303-182647807-6ajia7`
- Generated preview artifacts:
  - `preview/index.html`
  - `preview/frames/*.jpg` (7 files)
  - `preview/preview.json` (`event_rows=11`, `frames_exported=7`)

## Verify-lite (Iteration 4: User Review Capture)

| Проверка | Статус |
|----------|--------|
| User review ingested | ✓ (`user-feedback-iter4-2026-03-04.md`) |
| Error classes formalized | ✓ (state leakage / turn-context miss / onset drift / chain incompleteness) |
| Reusable rules added | ✓ (4 new process rules) |
| Rules index updated | ✓ (`rules/INDEX.md`) |

### Notes (Iteration 4)
- Эта итерация фиксирует и структурирует ошибки пользователя без изменения extractor-логики.
- Следующий технический шаг: внедрить правила 96-100 в `videoBaselineExtractor` и прогнать новый preview цикл.

## Verify-lite (Iteration 5: Focus-First Clarification)

| Проверка | Статус |
|----------|--------|
| User clarification captured | ✓ (focus-first addendum in feedback doc) |
| Turn-indicator rule hardened | ✓ (`gating` semantics) |
| New focus-first rule added | ✓ (ring + timebar priority) |
| Rules index updated | ✓ (`rules/INDEX.md`, item 100) |

### Notes (Iteration 5)
- Эта итерация уточняет приоритет сигналов без изменений extractor-кода.
- Следующий технический шаг: внедрить правила 96-100 в `videoBaselineExtractor`.

## Verify-lite (Iteration 6: Extractor Pass For Rules 96-100)

| Проверка | Статус |
|----------|--------|
| Тесты | ✓ passing (`node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js`) |
| Check | ✓ clean (`npm run check`) |
| CLI smoke with preview | ✓ passing |

### Notes (Iteration 6)
- Smoke run command: `npm run video:lab -- --video ... --sample-ms 2000 --max-frames 30 --preview --strict-extractor`
- Result run dir: `/tmp/video-hh-lab-iter3-focus/video-lab-20260304-123106970-qhvrqj`
- Output changes vs previous preview run:
  - removed false postfold events on flop: `PickleBaller/MrLouie/leeuw fold @ 36000`
  - added early preflop opener recovery: `AbbyMartin raise @ 0`
- Current output still requires next calibration pass (AbbyMartin mid-hand actions at `26000/28000/48000` may include residual ambiguity).

## Verify-lite (Iteration 7: Pot/Stack Priority Refinement)

| Проверка | Статус |
|----------|--------|
| Clarify Gate (iter7) | ✓ (`clarify-gate-iter7-pot-stack-priority.md`) |
| Тесты | ✓ passing (`node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js`) |
| Check | ✓ clean (`npm run check`) |
| CLI smoke with preview | ✓ passing |

### Notes (Iteration 7)
- Smoke run command: `npm run video:lab -- --video ... --sample-ms 2000 --max-frames 30 --preview --strict-extractor`
- Result run dir: `/tmp/video-hh-lab-iter6-focus-pot3/video-lab-20260304-133505410-8a0qqm`
- Output delta vs iter6 previous run:
  - removed stale pending action: `preflop AbbyMartin raise @26000`
  - kept inferred squeeze-response completion: `preflop ZootedCamel call @34000`
  - kept normalized postflop actions: `AbbyMartin bet @48000`, `ZootedCamel call_allin @52000`

## Verify-lite (Iteration 8: Pre-roll Ordering + Full-Video Pass)

| Проверка | Статус |
|----------|--------|
| Тесты | ✓ passing (`node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js`) |
| Check | ✓ clean (`npm run check`) |
| Full-video run with preview | ✓ passing |

### Notes (Iteration 8)
- Full run command: `npm run video:lab -- --video ... --out /tmp/video-hh-lab-full-review-s5 --sample-ms 5000 --max-frames 400 --strict-extractor --preview`
- Result run dir: `/tmp/video-hh-lab-full-review-s5/video-lab-20260304-142020434-g7h1eb`
- Extractor meta:
  - `sampled_frames=214`
  - `predicted_hands=11`
  - `predicted_events=81`
  - `extractor_stage=baseline_ocr_python`
- Added deterministic pre-roll tie-break rule to avoid `fold` being sorted after first aggression when both become `0ms`.

## Verify-lite (Iteration 9: 1s Baseline + Adaptive Refine + Preview QA Context)

| Проверка | Статус |
|----------|--------|
| Тесты | ✓ passing (`node --test tests/videoContract.test.js tests/videoLabMetrics.test.js tests/videoBaselineExtractor.test.js tests/videoLabPreview.test.js`) |
| Check | ✓ clean (`npm run check`) |
| CLI smoke with preview (`sample-ms=1000`) | ✓ passing |

### Notes (Iteration 9)
- Smoke run command: `npm run video:lab -- --video ... --out /tmp/video-hh-lab-iter9-smoke2 --sample-ms 1000 --max-frames 20 --strict-extractor --preview`
- Result run dir: `/tmp/video-hh-lab-iter9-smoke2/video-lab-20260304-205059947-s5r9b2`
- Extractor meta (smoke):
  - `sampled_frames=21` (включая adaptive extra frame)
  - `predicted_events=6`
  - `ocr_sample_ms=1000`
- Preview changes verified:
  - `# Global` column is monotonic and no longer resets by hand
  - `# In Hand` preserved for local order
  - `Focus` and `Pot` columns added
