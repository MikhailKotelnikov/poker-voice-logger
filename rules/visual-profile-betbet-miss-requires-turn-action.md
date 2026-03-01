# Title

BetBet Miss Requires Explicit Turn Action

## Problem

Some lines were incorrectly counted as `BetBet Miss` when target turn action was missing (or not resolved), which produced false miss bars despite real turn bets/probes.

## Rule

When classifying `BetBet Miss` (`b-x-x`) in visual profile, then require explicit target action on turn (`turn.hasAction === true`) in addition to `hasFlopBet && !hasTurnBet && !hasRiverBet && hasRiverAction`, because a miss is valid only if the skip happened on an observed turn decision.

## Examples

### Positive

- `flop cb33 / turn xb / river x` -> `BetBet Miss` (turn decision exists and is a check).
- `flop x / turn b50 / river xb` -> stays in probes, not `BetBet Miss`.

### Anti-pattern

- Counting `BetBet Miss` when turn text has no target action.
- Treating unresolved target turn segment as an implicit missed bet.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
