# Title

Visual All-In Lane Must Use Anchor Action, Not Any Street All-In

## Problem

All-in lane counts were polluted by lines where the target made a normal bet and only later called all-in after a raise.

## Rule

When assigning a sample to an all-in lane for a sizing/stat bucket, then use only the all-in flag of the target’s anchor action for that stat (direct bet/raise/donk), because later all-in calls must not reclassify the original sizing action as an all-in push.

## Examples

### Positive

- Flop: `target cb98 / villain r4x / target c allin` is counted in normal `P`, not in all-in lane.
- Turn BetBet: `target b97 allin` is counted in BetBet all-in lane.

### Anti-pattern

- Marking any street with `... c allin` as all-in lane for that street’s sizing bucket.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
