# Title

HH Profile Matching Must Support ID and Text Identity

## Problem

HH rows can store actors as `POS_<player_id>` or `POS_<nickname>`. ID-only matching skips valid rows for players selected by nickname, causing severe undercount in profile visualization.

## Rule

When selecting and filtering HH rows for visual profile, then derive a target identity from opponent input (`numeric id` if present, otherwise normalized nickname) and match actor tokens by that identity, because profile generation must work for both numeric and text actor markers.

## Examples

### Positive

- Opponent `12121116` matches `BB_12121116 ...`.
- Opponent `spirituallybroken` matches `SB_spirituallybroken ...`.
- For HH sheet, use full-row scan + identity filter instead of nickname-only lookup.

### Anti-pattern

- Running `get_opponent_rows` on HH sheet with nickname `HH` and opponent `spirituallybroken`.
- Filtering only by `\\d+` actor suffix and ignoring text suffixes.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
