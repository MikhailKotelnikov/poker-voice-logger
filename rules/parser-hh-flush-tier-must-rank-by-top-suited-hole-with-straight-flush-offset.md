# Title

HH Flush Tier Must Rank By Top Suited Hole Card With Straight-Flush Offset

## Problem

Flush tiers in HH notes (`nutflush/2ndflush/midflush/lowflush`) were unstable because ranking used full kicker ordering, which downgraded valid A-high flush cases to `midflush` on straight-flush-capable boards.

## Rule

When assigning non-straight-flush tiers for a made flush, then rank by the highest suited hole-card tier (not full kicker chain), and apply a single +1 offset if a straight flush is possible on that board, because project tiers are semantic buckets (`nut/2nd/mid/low`) rather than full combinational kicker ordering.

## Examples

### Positive

- Board `9d Td Jd`, hand `Ad Qd ...` -> `2ndflush` (straight flush is possible, so A-high flush shifts by one tier).
- Board `Kd 9d 2c 7d`, hand `Ad Qd ...` -> `nutflush` (no straight-flush option; top flush tier).
- Third/fourth suited-hole tiers map to `midflush`, fifth+ to `lowflush`.

### Anti-pattern

- Treating `AdQd` as `midflush` only because `AdKd` exists in deck.
- Ranking tiers directly by full five-card kicker ordering for this semantic profile.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
