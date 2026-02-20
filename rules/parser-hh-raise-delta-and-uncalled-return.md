# Title

HH Pot Math for Raises and Uncalled Returns

## Problem

Hand-history parsing produced wrong preflop line and postflop sizing when a raise used `toAmount` with prior posted chips and when an all-in bet had an uncalled return.

## Rule

When parsing HH pot flow, then compute raise contribution as `toAmount - playerStreetContribution` and apply `Uncalled bet (...) returned to ...` as pot rollback plus effective bet adjustment, because pot-based percentages must reflect called money, not announced shove size.

## Examples

### Positive

- `raises ¥690 to ¥1000` after posted chips updates pot by the delta to `¥1000`, not by `¥690`.
- `bets ¥2070`, `calls ¥180 and is all-in`, `Uncalled bet (¥1890) returned` yields effective flop sizing near `cb8.7` on that pot state.

### Anti-pattern

- Adding raw raise amount directly to pot for every `raises X to Y` line.
- Ignoring uncalled return lines and leaving flop bet as `cb116.95` when only short all-in amount was matched.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
