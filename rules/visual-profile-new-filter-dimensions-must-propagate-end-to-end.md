# Title

Visual Profile New Filter Dimensions Must Propagate End-To-End

## Problem

When a new profile filter is added (for example hand tags or board tags), partial wiring causes inconsistent behavior: buttons toggle in UI but cache keys stay old, chart/list diverge, or backend ignores the filter.

## Rule

When adding a new visual-profile filter dimension, then propagate it through frontend defaults/cloning/serialization, chart and list request params, backend query normalization and cache serialization, and regression tests, because profile filtering is only correct when all layers use the same filter signature.

## Examples

### Positive

- Added `handTags` and `boardTags` to `createDefaultProfileFilters`, `cloneProfileFilters`, and cache key serialization.
- Sent `hands`/`boards` in both `/api/opponent-visual-profile` and `/api/opponent-visual-list` requests.
- Parsed `hands`/`boards` in backend filter normalization and covered with tests.

### Anti-pattern

- Added hand-tag buttons only in UI, but forgot query params for list mode.
- Backend supports `boards` filter, but frontend cache key omits it, returning stale data.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
