# Title

Visual Tooltip Readonly Mode Must Show Saved Timings

## Problem

Tooltip hover mode is read-only (`interactive=false`). If timing rendering is tied only to editable controls, saved timings disappear until pin/edit mode is activated.

## Rule

When rendering HH actions in read-only tooltip mode, then display saved timing labels as static badges and hide only empty timings, because persisted observations must be visible without entering edit mode.

## Examples

### Positive

- Hover tooltip shows `90% t` immediately for actions with saved timing.
- Actions without saved timing show no timing badge in read-only mode.

### Anti-pattern

- Saved timing appears only after click/pin because only `<select>` controls are rendered in interactive mode.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
