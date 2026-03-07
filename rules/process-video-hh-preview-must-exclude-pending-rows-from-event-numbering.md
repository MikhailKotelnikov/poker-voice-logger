# Title

Video-HH Preview Must Exclude Pending Rows From Event Numbering

## Problem

If pending decision frames are rendered as normal events, human review mixes true actions with unresolved states and global numbering becomes misleading.

## Rule

When generating a preview that is meant to list extracted events, then rows marked as pending-only decision states must be hidden from the event list and excluded from global numbering, because unresolved focus frames are review context, not confirmed poker actions.

## Examples

### Positive

- A stale preflop `CALL` badge with unchanged pot is kept for internal reasoning but is hidden from the preview event table, so the next committed action receives the next visible global number.

### Anti-pattern

- Preview shows `action=call`, `state=pending` as a numbered event between two committed actions.

## Validation Checklist

- [ ] Pending-only rows are excluded from the rendered event table.
- [ ] Visible global numbering is recalculated after pending-row filtering.
- [ ] Preview still preserves explainability for rendered committed/inferred events.
