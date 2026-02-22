# Title

Infer `Lx` And `Sx` Tags From No-Showdown Postflop Outcomes

## Problem

Without showdown cards, postflop lines lose hand-strength signal in profile colors. Aggression that forced folds and folds after prior aggression were both collapsed into unknown.

## Rule

When a postflop segment has no showdown hand token, then infer tags from sequence: add `S{street}` if player's bet/raise is followed only by opponent folds; add `L{street}` if player folds after own earlier aggression (same or earlier street), because these outcomes carry reusable conditional-strength information.

## Examples

### Positive

- `... cb75 / villain f` (no shown cards) -> add `Sf`.
- `flop cb...`, later `river ... hero f` (no shown cards) -> add `Lr`.

### Anti-pattern

- Leaving such lines untagged and forcing white/unknown only.
- Assigning `Sx/Lx` when showdown hand class is already known.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
