# Title

Video-HH Player State Must Block Actions After Fold In Same Hand

## Problem

Action-only OCR tokens can reintroduce already-folded players on later streets, producing impossible hand sequences and inflated event counts.

## Rule

When a player is marked as `fold` within a hand, then reject any subsequent actions from that player until a new hand starts, because folded players cannot legally act again in the same hand.

## Examples

### Positive

- Preflop `PickleBaller fold` is accepted; later `flop PickleBaller fold` token is ignored as stale overlay noise.

### Anti-pattern

- Keep appending `MrLouie fold` on flop/turn after `MrLouie fold` already happened preflop.

## Validation Checklist

- [ ] Per-hand player state is tracked (`active`, `folded`, `allin`).
- [ ] Events from `folded` players are filtered before canonical output.
- [ ] New hand reset clears previous player states.
- [ ] Smoke preview shows no repeated fold events for eliminated players.
