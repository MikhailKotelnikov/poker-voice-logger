# Title

HH Card Visibility Must Distinguish Showdown vs Dealt Source

## Problem

Hands where cards are known from `Dealt to <hero>` (without showdown) were either lost from optional card-aware views or mixed into default showdown-only analysis.

## Rule

When parsing/storing HH cards for profile visualization, then persist dealt-known cards separately from showdown cards and apply visibility filter on read (`showdown` -> showdown only, `known` -> showdown or dealt), because default opponent-view analysis must stay showdown-only while users can explicitly include hero-known non-showdown hands.

## Examples

### Positive

- Parser captures `Dealt to cryptopunk0 [Jc As Js Ad Qs]` into a dealt-cards map even if no `SHOW DOWN` section exists.
- DB keeps `showdown_cards` and `dealt_cards` separately per hand/player.
- UI default sends `cards=showdown`; switching to `known` includes hands with only dealt-known cards.

### Anti-pattern

- Storing all known cards only in `showdown_cards`, making source indistinguishable.
- Filtering by “known cards” using showdown-only data and hiding dealt-known hands.
- Making dealt-known hands visible in default showdown-only mode.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
