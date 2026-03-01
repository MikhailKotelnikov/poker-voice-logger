# Title

Visual Profile Cache Key Must Include Active Filters

## Problem

When profile cache keys ignore selected filters, switching date/player-count/game/room/pot filters returns stale bars from a previous query.

## Rule

When requesting or storing opponent profile data, then include the full active filter signature in the cache key and API request, because filtered and unfiltered profiles must never share one cache entry.

## Examples

### Positive

- Cache key format includes `source + filters + opponent` (for example: `hh::players=3-4|date=1m|games=5|...::spirituallybroken`).
- Changing any filter forces a different key and fetches fresh profile data.

### Anti-pattern

- Cache key uses only `source + opponent`, so selecting `today` still shows cached `all-time` bars.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
