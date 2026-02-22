# Title

BetBet Miss Strength Must Use The Street Where Bet Was Missed

## Problem

For `b-x-x` lines, using river class for `BetBet Miss` can mislabel strength (for example, turn `2p` upgraded to river `str`) and distort the intended miss-spot profile.

## Rule

When counting `BetBet Miss`, then classify strength from the miss-decision street (turn for `b-x-x`, river for `x-b-x`), because this section is about missed continuation timing, not final runout strength.

## Examples

### Positive

- `flop b`, `turn xb(2p)`, `river x(str)` -> `BetBet Miss` strength = `twoPair`.
- `flop x`, `turn b`, `river x` -> `BetBet Miss` strength from river segment.

### Anti-pattern

- Always using river strength for every `BetBet Miss` row.
- Marking turn-miss lines as strong made because river improved.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
