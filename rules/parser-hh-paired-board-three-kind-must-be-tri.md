# Title

Paired-Board Three-Of-A-Kind Must Be Tagged As `tri`, Not `set`

## Problem

HH showdown classification on paired boards labeled three-of-a-kind as `set`, which inflated strong-made interpretation and broke semantic distinction between pocket-set and trips.

## Rule

When street board is paired and best made class is three-of-a-kind, then emit `tri` instead of `set`, because on paired boards three-of-a-kind is trips structure, not pocket-set structure.

## Examples

### Positive

- Board `J J 7`, hand includes one `J` -> class `tri`.
- Tooltip/action suffix uses `_tri`, not `_set`.

### Anti-pattern

- Emitting `_set` on `J J 7` with one jack in hand.
- Using same token for unpaired-board pocket set and paired-board trips.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
