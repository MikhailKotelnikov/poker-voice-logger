# Title

HH Profile Targeting by Actor ID

## Problem

When HH rows are stored without nickname in column A, nickname-based lookup misses relevant rows for profile generation.

## Rule

When building visual profiles for hand-history rows, then match target by `<POS>_<PLAYER_ID>` actor tokens in street cells and keep only rows with active participation, because HH storage may intentionally leave nickname empty.

## Examples

### Positive

- Target `12121116` is found in `BB_12121116 r31bb ...` and row is included.
- Row with only `SB_12121116 f` preflop and no postflop presence is excluded from profile samples.

### Anti-pattern

- Filtering HH rows only by `nickname` column equality.
- Including every row with target ID token even when target never actively entered the hand.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
