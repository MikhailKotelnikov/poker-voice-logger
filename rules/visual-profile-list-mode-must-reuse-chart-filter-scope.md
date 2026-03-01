# Title

List mode must reuse chart filter scope and order by newest first

## Problem

When chart and list views use different filter logic or ordering, users cannot compare stats and hand samples reliably.

## Rule

When rendering visual profile list mode, then use the same full filter set as chart mode (source/players/date/game/limit/room/pot/`vs`/recent) and return samples newest-to-oldest by played time, because list mode is a detailed view of the same selection, not a different dataset.

## Examples

### Positive

- User sets `vs=PlayerX` and `recent=20`; chart and list both reflect the same 20 filtered hands.
- User applies room filter; list contains only rows from that room and starts from latest hand.

### Anti-pattern

- Chart applies `vs` filter but list ignores it.
- List is sorted by row id or insertion order instead of played time descending.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
