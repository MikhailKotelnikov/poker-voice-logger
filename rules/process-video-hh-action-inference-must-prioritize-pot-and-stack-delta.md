# Title

Video-HH Action Inference Must Prioritize Pot/Stack Delta Over Static Action Text

## Problem

Static action labels can persist across frames and produce false events unless confirmed by actual game-state change.

## Rule

When OCR action text conflicts with pot/stack continuity, then trust pot/stack delta and suppress stale text-only actions, because real betting decisions must change committed chips and/or pot trajectory.

## Examples

### Positive

- A pending preflop responder shows repeated `RAISE` label while pot is unchanged; extractor keeps player in `deciding` state and waits for delta-confirmed action.

### Anti-pattern

- Emit new `raise` every time OCR still reads the same button label, even though pot and stack state did not move.

## Validation Checklist

- [ ] Action-only events are gated by state delta checks when available.
- [ ] Pending-response spots suppress stale aggression without pot growth.
- [ ] Pot/stack-consistent actions survive filtering.
- [ ] Preview review confirms lower stale-label noise.
