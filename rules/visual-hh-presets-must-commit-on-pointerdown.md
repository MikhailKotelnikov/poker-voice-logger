# Title

HH Preset Selection Must Commit On Pointerdown

## Problem

Preset dropdown selections inside editable tooltip inputs can be lost when blur/re-render happens before `click` fires, so users see the preset choice but it is not persisted.

## Rule

When handling preset selection in HH manual fields, then commit the preset on `pointerdown` (with `preventDefault`) and run save immediately, because pointerdown executes before blur/click race conditions and makes one-click persistence reliable.

## Examples

### Positive

- Preset button uses `pointerdown` to append text and call save API.
- Input remains focused and preset menu can stay open for rapid multi-pick entry.

### Anti-pattern

- Saving only on `click` while blur handlers and tooltip refresh can remove the DOM node first.
- Relying on visual insertion in input without persisting to backend on selection.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
