# Title

Visual Profile Counts Only Target Actions

## Problem

HH rows contain both players in one street line; counting the full line misattributes opponent bets to the selected target profile.

## Rule

When building visual profile metrics for a specific player ID, then filter each street to only `<POS>_<TARGET_ID>` segments before bucket/strength detection, because profile stats must reflect actions made by the selected player, not calls or bets from opponents.

## Examples

### Positive

- `SB_85033665 cb8.7 / BB_12121116 c` for target `12121116` contributes nothing to flop bet buckets.
- `BB_12121116 cb75 / SB_85033665 f` contributes to bucket `7` for target `12121116`.

### Anti-pattern

- Using the full street string for bucket detection when both actors are present.
- Counting opponent `cb` as target flop bet because both are in one row.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
