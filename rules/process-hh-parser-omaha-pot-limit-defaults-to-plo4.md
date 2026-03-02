# Title

HH Parser Must Default Omaha Pot Limit To PLO4

## Problem

Some PokerStars hand headers use `Omaha Pot Limit` without explicit `4 Card Omaha`, which previously left `game_card_count` empty and produced wrong metadata (`PLO0`/missing game filters).

## Rule

When parsing HH headers that contain `Omaha Pot Limit` but no explicit card count, then set `game_card_count=4` and derive game label as `PLO4`, because classic Omaha defaults to 4 cards and metadata must stay filterable.

## Examples

### Positive

- Header `PokerStars Hand #...: Omaha Pot Limit (¥10/¥20 CNY)` results in `game_card_count=4`.
- Visual/meta output for that hand shows `PLO4` and supports `PLO4` filters.

### Anti-pattern

- Leaving card count as `null` for `Omaha Pot Limit` headers.
- Rendering `PLO0` or non-filterable empty game metadata for valid Omaha hands.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
