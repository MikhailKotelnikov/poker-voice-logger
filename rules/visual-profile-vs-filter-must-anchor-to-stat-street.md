# Title

VS filter must be validated at each stat anchor street

## Problem

A hand-level VS match can leak into wrong buckets when the VS player participated earlier (for example preflop/flop) but not on the street where the stat is computed (for example turn BetBetBet).

## Rule

When counting a visual stat under `VS игрок`, then require VS-player participation on that stat’s anchor street (flop for flop stats, turn for turn stats, river for river stats), because VS-filtered statistics must represent direct interaction at the exact decision point.

## Examples

### Positive

- VS player folds on flop; hand can appear in VS-filtered flop buckets, but not in turn or river buckets.
- VS player acts on turn; hand can appear in VS-filtered turn BetBet/Probe buckets.

### Anti-pattern

- Hand is counted in VS-filtered turn BetBetBet only because VS player was active preflop.
- Hand is counted in VS-filtered flop bucket where VS player is absent from flop actions.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
