# Title

HH Game-Card Filter Must Fallback to `game_type`

## Problem

Legacy HH DB rows can have empty `game_card_count`, which breaks PLO4/PLO5/PLO6 filtering even when `game_type` still contains the card count.

## Rule

When filtering HH profile rows by game-card count, then resolve card count with fallback from `game_type` (for example `PLO4` -> `4`) if `game_card_count` is null, because legacy rows must stay queryable without manual backfill.

## Examples

### Positive

- `game_card_count` is null, `game_type` is `PLO4`, and filter `4` still returns the row.

### Anti-pattern

- Filter logic reads only `game_card_count` and drops all legacy rows with null values.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
