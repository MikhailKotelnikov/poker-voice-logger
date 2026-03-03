# Title

HH Header Timezone Must Be Converted To UTC

## Problem

Different poker rooms export hand timestamps in different time zones (for example `UTC` and `ET`). Treating all header times as already-UTC silently shifts chronology and breaks date filters, comparisons, and cross-source ordering.

## Rule

When hand header time contains an explicit timezone token (for example `ET`), then convert that wall-clock time to true UTC before saving `played_at_utc`, because `played_at_utc` is a canonical UTC field and must represent the same instant across sources.

## Examples

### Positive

- `2026/02/24 12:59:35 ET` -> `2026-02-24T17:59:35Z`.
- `2026/02/22 21:12:14 UTC` -> `2026-02-22T21:12:14Z` (unchanged instant).

### Anti-pattern

- Saving `2026/02/24 12:59:35 ET` as `2026-02-24T12:59:35Z` without timezone conversion.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
