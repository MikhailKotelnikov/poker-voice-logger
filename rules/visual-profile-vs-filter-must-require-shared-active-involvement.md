# Title

VS filter must require shared active involvement in the same hand

## Problem

`VS игрок` filters can become misleading if they match hands where players only posted blinds/antes or were present but never interacted.

## Rule

When applying a visual profile `vs` filter, then include a hand only if target and opponent either both had active preflop actions (`call`/`bet`/`raise`) or both acted on the same postflop street (`check`/`call`/`bet`/`raise`/`fold`), because the filter must represent real interaction, not passive table presence.

## Examples

### Positive

- Target raises preflop and `vs` player calls preflop -> hand is included.
- Target bets flop and `vs` player folds flop -> hand is included.

### Anti-pattern

- `vs` player only posts blind, folds to open, and target never interacts with that player postflop -> hand is still included.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
