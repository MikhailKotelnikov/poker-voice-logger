# Title

Visual Profile Prefetch Must Await In-Flight Requests

## Problem

Secondary profile panels (for example voice context or mirror view) can show false errors when they request data while the same cache key is already in `loading` state and the prefetch function returns `null`.

## Rule

When profile or list prefetch is called for a cache key that is already loading, then return/await the existing in-flight promise instead of returning empty payload, because concurrent consumers must share one fetch result and not interpret loading as failure.

## Examples

### Positive

- Modal opens and starts voice-list prefetch; right panel requests the same key and waits for that promise, then renders rows on first open.
- Mirror list/profile requests reuse pending requests for the same opponent+filters signature.

### Anti-pattern

- Function returns `null` when cache entry is `loading`, causing UI to render `Не удалось загрузить...` even though request is still running.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
