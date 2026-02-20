# Title

HH Uncalled Return Must Not Create Zero-Sized Bets

## Problem

If uncalled return is always subtracted from the last bet/raise amount, fully uncalled bets become `b0`/`r0` in generated notes and pollute visual sizing buckets.

## Rule

When processing `Uncalled bet (...) returned` in HH parsing, then reduce the prior aggressor amount only when an opposing `call`/`raise` actually matched part of that action, because partial all-in spots need effective sizing, while fully uncalled bets must keep declared sizing for action classification.

## Examples

### Positive

- `bet 9`, opponent folds, full uncalled return `9` → keep action token `b75` (not `b0`).
- `bet 2070`, opponent calls `180 all-in`, uncalled `1890` returned → use effective called amount for sizing.

### Anti-pattern

- Always subtract uncalled from previous bet and emit `b0` for fold-to-cbet lines.
- Treat full uncalled and partial all-in return as the same case.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
