# Title

Visual Tooltip Manual Inputs Must Override Global Text Input Style

## Problem

Global selectors like `input[type="text"]` can override tooltip-specific manual fields, turning themed note inputs into default white controls and breaking readability.

## Rule

When styling manual inputs inside the visual tooltip, then use selectors with equal or higher specificity than global text-input rules (for example `.pt-manual-input[type="text"]`) and define explicit focus state colors, because class-only selectors can lose against global attribute selectors.

## Examples

### Positive

- Tooltip note fields use `.pt-manual-input[type="text"]` with explicit `background`, `color`, and `:focus` styles.
- Manual field color remains consistent in hover/pinned/edit modes.

### Anti-pattern

- Styling tooltip input only with `.pt-manual-input` while global `input[type="text"]` exists, causing white background regression.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
