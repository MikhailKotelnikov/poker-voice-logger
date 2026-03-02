# Title

HH Manual Inputs Must Roll Back Optimistic Values On Save Failure

## Problem

Manual HH fields can show newly typed/preset text immediately in UI before persistence is confirmed. If API save fails, the tooltip still looks updated and misleads users until reopen.

## Rule

When applying optimistic updates for HH manual inputs, then keep a committed snapshot and restore both input text and parsed manual state on save failure, because UI must reflect persisted DB state rather than transient local draft.

## Examples

### Positive

- User clicks preset, request fails, field reverts to previous saved value.
- Enter-save fails and the street field restores committed text instead of unsaved draft.

### Anti-pattern

- Mutating parsed manual state before save and leaving it unchanged after API error.
- Field appears saved in pinned tooltip but disappears after reopen.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
