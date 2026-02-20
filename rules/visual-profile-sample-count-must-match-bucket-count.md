# Title

Visual Profile Tooltip Must Expose All Counted Samples

## Problem

Bucket totals can show `N`, but tooltip reveals fewer hands when samples are silently capped in backend or frontend, making verification impossible.

## Rule

When collecting and rendering visual-profile tooltip samples, then keep one sample per counted hand without hidden caps/truncation, because tooltip count must be auditable against the bucket total.

## Examples

### Positive

- Bucket total `57` → tooltip can scroll through all `57` samples.
- Duplicate textual lines are still stored separately when they represent distinct counted hands.

### Anti-pattern

- Capping samples to `6` while showing total `12`.
- Truncating sample array in UI (`slice(...)`) and hiding the remaining hands.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
