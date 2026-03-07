# Title

Video-HH Action Commit Must Require Two Independent Signals

## Problem

Single-signal commits (for example static `CALL/RAISE` overlay without state transition) create false certainty and wrong action ownership.

## Rule

When converting frame observations into committed poker actions, then require at least two independent confirmations (focus/turn context, pot-or-stack delta, legal turn-order progression, or street transition anchor), because one visual signal can be stale while state transitions provide causal confirmation.

## Examples

### Positive

- `CALL` token appears while focus is ambiguous and pot is unchanged: keep action pending until a confirming anchor appears.

### Anti-pattern

- Commit `ZootedCamel call` from one OCR `CALL` label even though pot/stack/turn progression do not confirm completion.

## Validation Checklist

- [x] Specific and testable
- [x] Reusable in future tasks
- [x] Not duplicated elsewhere

