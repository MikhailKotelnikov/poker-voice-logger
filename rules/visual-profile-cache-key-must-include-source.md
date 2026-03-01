# Title

Visual Profile Cache Key Must Include Source Scope

## Problem

When profile data can be loaded from multiple sources (`all`, `voice`, `hh`), caching only by opponent causes cross-source collisions: DB profile may be replaced by Sheets profile (or vice versa) and modal content appears inconsistent.

## Rule

When requesting or storing opponent profile visualization, then build the cache key as `<source>::<opponent>` and pass `source` to backend profile API, because source-scoped caching prevents stale/mixed profile responses.

## Examples

### Positive

- `prefetchOpponentProfile("12121116", { source: "hh" })` stores entry under `hh::12121116`.
- `prefetchOpponentProfile("12121116", { source: "all" })` stores independent entry under `all::12121116`.

### Anti-pattern

- Keep one cache entry for `12121116` and overwrite it with whichever source was loaded last.
- Open “DB profile” button but fetch API without `source=hh`.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
