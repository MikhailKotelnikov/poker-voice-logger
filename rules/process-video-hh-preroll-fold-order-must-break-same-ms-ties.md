# Title

Video-HH Pre-Roll Fold Inference Must Break Same-Timestamp Ties Before First Aggression

## Problem

When extraction starts after the first action, inferred early folds can be moved to the same `frame_ms` as the first raise. Stable sorting then preserves the original wrong order (`raise` before `fold`).

## Rule

When pre-roll inference repositions an early preflop fold near the first aggression, then force tie-break ordering so inferred fold events sort before the first aggression at equal timestamps, because event chronology must match betting order even when frame timestamps collide at `0ms`.

## Examples

### Positive

- First sampled frame contains `AbbyMartin RAISE`, next frame shows `leeuw FOLD`; inferred fold is marked as pre-roll and emitted before the raise even if both are `0ms`.

### Anti-pattern

- Reposition fold to `0ms`, keep raise at `0ms`, and rely on plain timestamp-only sort, resulting in `raise` first and incorrect preflop order.

## Validation Checklist

- [x] Specific and testable
- [x] Reusable in future tasks
- [x] Not duplicated elsewhere
