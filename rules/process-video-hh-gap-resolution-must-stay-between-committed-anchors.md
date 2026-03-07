# Video-HH Gap Resolution Must Stay Between Committed Anchors

## Problem

Если восстановление пропущенных действий смотрит слишком далеко назад или переписывает уже зафиксированную историю, движок начинает галлюцинировать legal-looking линии и ломает проверяемость reconstruction.

## Rule

When reconstructing missing video-HH actions, resolve gaps only inside the nearest window bounded by committed anchors; then either infer a single legal line, mark the window ambiguous, or mark the hand invalid, because local windows keep inference testable and prevent rewriting settled history.

## Positive Example

### Example: one pending responder is resolved by the next pot anchor

When the last committed anchor shows one pending responder and the next committed anchor shows a pot increase equal to exactly one missing call, then infer that call inside this window only and keep all earlier committed actions unchanged.

## Anti-Pattern Example

### Example: the resolver rewrites earlier history to fit a later frame

When the resolver jumps several nodes back, changes an already committed raise or fold, and then forces a later street transition to look consistent, then the reconstruction is not trustworthy even if the final story seems plausible.

## Validation Checklist

1. Every inferred action references `anchorFrom` and `anchorTo`.
2. Gap resolution never mutates committed actions outside the active window.
3. If more than one legal line fits the window, the result is `ambiguous`, not auto-committed.
4. If no legal line fits the window, the hand is marked `invalid`.
