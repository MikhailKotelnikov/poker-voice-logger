# Title

Video-HH Turn Indicator Must Gate Action Assignment To Active Actor

## Problem

Persistent seat labels (`FOLD/CALL/RAISE`) may stay visible while another player is currently acting, causing false actor/action assignments.

## Rule

When turn-indicator cues are present (active-seat highlight and/or decision timer), then gate action assignment to the active seat first and suppress conflicting static action badges from non-active seats, because active-turn UI is the authoritative source of who is acting now.

## Examples

### Positive

- On flop frame with active ring/timer around `AbbyMartin`, do not emit new `fold/call/raise` for other seats until focus moves.

### Anti-pattern

- Emit three new flop folds from non-active seats while one highlighted player still has active timer.

## Validation Checklist

- [ ] Extractor checks active-turn cues before any action-only event emission.
- [ ] Non-active-seat action tokens are blocked (not only low-confidence).
- [ ] Actor inference records whether turn-indicator gating was applied.
- [ ] Preview review shows events aligned with active seat/timer ownership.
