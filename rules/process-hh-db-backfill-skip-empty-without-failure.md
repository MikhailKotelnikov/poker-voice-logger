# Title

HH DB Backfill Must Track Empty Hands Separately From Failures

## Problem

Bulk HH archives can contain hands that produce no actionable notes (all streets empty after deterministic parsing). Treating such hands as failures distorts import quality metrics.

## Rule

When deterministic HH backfill to SQLite yields a hand with empty `preflop/flop/turn/river/presupposition`, then skip DB note save and count it in `skippedEmpty` (not `failed_count`), because empty-note hands are non-actionable but not parser errors.

## Examples

### Positive

- A batch run records `hand_count=217`, `saved_count=216`, `failed_count=0`, and local `skippedEmpty=1`.

### Anti-pattern

- Increasing `failed_count` for folded/empty hands that parsed without exceptions.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
