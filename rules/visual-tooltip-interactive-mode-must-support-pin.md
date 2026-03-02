# Title

Visual Tooltip Interactive Mode Must Support Pin

## Problem

Hover tooltips disappear on small mouse movement, making manual edits (timings/presuppositions) impossible when working from chart segments.

## Rule

When a visual-profile tooltip is used for interactive editing, then support click-to-pin and explicit close (for example, double-click to unpin/close), because editing requires a stable overlay with pointer interaction.

## Examples

### Positive

- Hover shows transient tooltip; single left click pins it and enables interaction.
- While pinned, tooltip does not auto-hide on mouseleave/mousemove.
- Double left click closes/unpins tooltip.

### Anti-pattern

- Reusing pure hover behavior (`mouseenter/mouseleave`) for editable tooltip content.
- Keeping tooltip `pointer-events: none` while expecting user to click controls inside it.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
