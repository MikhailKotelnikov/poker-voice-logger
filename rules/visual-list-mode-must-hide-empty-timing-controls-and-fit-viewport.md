# Title

Visual List Mode Must Hide Empty Timing Controls And Fit Viewport

## Problem

In list visualization mode, rendering empty timing controls for every action creates noise, and fixed minimum widths can force horizontal clipping/scroll that truncates manual note fields.

## Rule

When rendering editable HH rows in list mode, then hide timing controls for actions without saved timing and keep row/layout widths within viewport (no mandatory horizontal scrolling), because list mode must prioritize scanability and full-note visibility.

## Examples

### Positive

- List mode shows timing control only where timing exists.
- Local/global manual fields remain fully visible within modal width without right-cutoff.

### Anti-pattern

- Showing `t` controls on every empty action in list mode.
- Forcing `min-width` that clips right-side manual fields and requires horizontal scroll.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
