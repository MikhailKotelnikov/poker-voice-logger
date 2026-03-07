# Video-HH Reconstruction Must Be Ledger-First With Validator

## Problem

Прямое преобразование OCR-строк в покерные actions приводит к пропущенным обязательным ответам, нелегальным переходам между улицами и историям, которые нельзя проверить по банку и очереди хода.

## Rule

When reconstructing hand histories from video, derive actions from a hand ledger with turn order, committed chips, pending obligations, and a separate validation pass; then only accept the hand output if the validator confirms pot/order/street-closure consistency, because poker legality is defined by money flow and response closure, not by OCR action text alone.

## Positive Example

### Example: stale call badge stays pending until the bank proves it

When a frame shows a `CALL` badge next to a player but the pot has not increased and the player still has focus, then keep that frame as a pending observation rather than a committed action. When the next committed anchor shows either a pot increase equal to the missing call or a legal street transition that can only happen if that call occurred, then infer and record the call with proof metadata.

## Anti-Pattern Example

### Example: OCR badge is committed directly as an action

When the OCR reads `CALL` and the system immediately emits a committed call, advances the timeline, and only later discovers that the pot math or response chain does not close, then the reconstruction is invalid. This creates a plausible-looking but legally inconsistent hand history.

## Validation Checklist

1. Reconstruction state includes turn order and committed chips per player.
2. Street transition is blocked unless mandatory responders are resolved or the gap is explicitly marked `ambiguous`.
3. Inferred actions are justified by ledger-consistent anchors.
4. A validator checks pot math, actor order, and response closure before the hand is accepted.
