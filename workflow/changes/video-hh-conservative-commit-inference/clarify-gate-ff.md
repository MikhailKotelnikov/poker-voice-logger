# Clarify Gate: video-hh-conservative-commit-inference (/ff)

## Task

Реализовать conservative commit и anchor-based inference в текущем video-HH extractor/preview:
- убрать ложный focus fallback на терминальных строках (должен быть `focus=none`);
- ослабить commit по одиночным action-token сигналам в preflop response spots;
- помечать слабые/достроенные события как `inferred` (не `committed`);
- сохранить совместимость `canonical_hand_v1` и существующего run pipeline.

## Input contract

- OCR frames (`ms`, `lines[]`) из Python/AVFoundation helpers.
- Current extractor event model (`event_id`, `street`, `actor`, `action`, `evidence`).

## Output contract

- `events.json` с тем же базовым schema + optional поля:
  - `resolution_state` (`committed|inferred`)
  - `reason_codes[]`
- `preview/index.html` с корректным `Focus` на terminal rows (`none`).

## Edge cases

1. Нет явного focus cue (`is currently deciding`): нельзя автоматически делать commit только по одному `CALL/RAISE`.
2. Preflop squeeze-response chain: если потенциальный response action stale (pot stable), не коммитить мгновенно.
3. Последний event в hand: если это terminal fold/all-in lock, `focus=none`, не fallback actor.
4. Existing inferred synthetic events (`inferred_preflop_response`, `focus_inferred_open_raise`) должны оставаться low-confidence и explicit.

## Compatibility

- Не ломаем обязательные поля `canonical_hand_v1`.
- Optional поля добавляются без изменения старых consumers.
- HH draft и metrics должны продолжать работать.

## Tests (TDD-by-signal)

- Добавить regression tests:
  1. stale pending preflop `CALL` при stable pot не коммитится сразу; закрывается как inferred near anchor.
  2. terminal preview focus принудительно `none`.
  3. preview focus для `inferred` row не перезаписывается next-frame actor.

## Done criteria

- Acceptance criteria из `proposal.md` закрыты.
- Targeted tests green.
- `npm run check` green.
- `verify-lite.md` обновлён по факту кодовой реализации.

