# Title

Visual Profile Tag Filters Must Apply Per Anchor Street

## Problem

Global row-level tag filtering causes false positives in profile buckets: a hand that gets `set` only on river can leak into flop/turn stats when those streets are counted from the same row.

## Rule

When applying hand/board tag filters in visual profile stats, then evaluate filters on the section anchor street (flop for flop stats, turn for turn stats, river for river stats) instead of the whole hand row, because each stat bucket represents one street decision point.

## Examples

### Positive

- `handTags=[set]` includes a row in river stats when river has `set`, but does not include the same row in flop miss buckets if flop has no `set`.
- Turn probe rows are filtered by turn tags only, not by river tags.

### Anti-pattern

- Collect tags from all streets first and reuse that match for flop/turn/river buckets.
- A river-only `set` makes flop `x`/`miss` bars appear under `set` filter.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
