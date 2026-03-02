# Title

Visual Miss Rows Must Mark Target Call-Off All-Ins In All-In Lane

## Problem

Miss and Miss Donk rows were counted only in normal lane when the target committed stack via call, which hid forced stack-off behavior in timing/sizing review.

## Rule

When assigning all-in lane for `Miss`/`Miss Donk` rows, then mark the sample as all-in if the target calls all-in directly or calls after an opponent all-in bet/raise on that street, because call-off commitments are all-in outcomes even without a target bet anchor.

## Examples

### Positive

- Turn line: `target x / villain b100 allin / target c` counts as `Miss` in all-in lane.
- River line with `Miss Donk` + target call-off is counted in all-in lane for that row.

### Anti-pattern

- Counting call-off all-in misses only in normal lane.
- Requiring explicit target `b/r allin` token for every all-in lane classification.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
