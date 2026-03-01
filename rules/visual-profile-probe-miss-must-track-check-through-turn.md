# Title

Probe Miss Must Track Flop Check-Through Turn Spot

## Problem

Probe-miss buckets stay empty when target turn checks after flop check-through, even though the player had a valid probe opportunity.

## Rule

When flop checks through to turn and target checks turn instead of betting, then classify the spot as `probes miss` for the corresponding HU/MW branch, because missed probe opportunities are strategy-critical and must be counted explicitly.

## Examples

### Positive

- Flop `x/x`, turn target `x` -> row increments in `Probes` `Miss` (HU or MW depending on active players).

### Anti-pattern

- Flop `x/x`, turn target `x` is ignored and no `Probes Miss` count is added.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
