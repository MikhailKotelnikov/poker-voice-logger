# Title

Tooltip Hole Cards Must Be Sorted High-To-Low

## Problem

Unsorted hole cards reduce readability in dense tooltip rows and slow manual review.

## Rule

When rendering player hole cards in profile tooltip, then sort cards by rank from high to low while keeping board order unchanged, because users scan strength faster on normalized hole-card ordering.

## Examples

### Positive

- `K 5 5 3 6` renders as `K 6 5 5 3`.
- Board `T 4 5` remains `T 4 5` (original street order).

### Anti-pattern

- Displaying hole cards in raw ingest order.
- Sorting board cards and losing runout chronology.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
