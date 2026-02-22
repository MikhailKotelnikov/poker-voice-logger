# Title

Raise-Multiplier Tokens Must Not Map To Sizing Buckets

## Problem

Postflop check-raise tokens in HH notes use multiplier format (`r5x`, `r6.2x`). If parsed as percent sizing, they are incorrectly bucketed as tiny bets (`2` bucket), which corrupts flop/turn sizing profiles.

## Rule

When computing visual-profile sizing buckets, then treat `r<number>x` as aggression without a percent bucket and never convert it to `b<number>`, because raise multipliers are not pot-percent sizings.

## Examples

### Positive

- `BB_target x / HJ_villain cb47.5 / BB_target r5x / HJ_villain f` does **not** enter bucket `2`.
- A line with only `x` and `r5x` is excluded from `%` buckets.

### Anti-pattern

- Mapping `r5x` to `5%` and counting it in bucket `2`.
- Treating check-raise multiplier lines as micro-bets in `Flop Bets`.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
