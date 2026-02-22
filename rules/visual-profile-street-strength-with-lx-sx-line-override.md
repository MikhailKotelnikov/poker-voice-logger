# Title

Visual Profile Uses Street-Local Strength With Lx/Sx Line Overrides

## Problem

Strength classification can drift when one street improves later streets; this causes wrong colors in street-specific sections and incorrect BetBet Miss interpretation.

## Rule

When assigning strength for a section/street, then take strength from that exact street text, because hand strength is street-local; only `Lx` and `Sx` tags may override and propagate across the full line.

## Examples

### Positive

- `flop ... _2p`, `turn ... _full` -> flop section counts `twoPair`, turn-derived sections count `strong`.
- `b-x-x` line -> `BetBet Miss` strength comes from turn street.
- `x-b-x` line -> `BetBet Miss` strength comes from river street.
- If line has `Lr` or `Sr`, all counted streets in that line use `lightFold`/`conditionalStrong`.

### Anti-pattern

- Using river strength for flop/turn buckets when no `Lx/Sx` override exists.
- Treating `b-x-x` miss as river strength instead of turn.
- Applying street-local class while ignoring explicit/inferred `Lx` or `Sx` line tags.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
