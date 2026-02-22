# Title

Visual Semantic Colors On Dark Bars Must Be Opaque

## Problem

Semi-transparent semantic colors (`rgba(..., alpha)`) over dark profile-bar backgrounds visually shift to muddy tones and become indistinguishable from neighboring classes.

## Rule

When defining profile legend/bar colors for semantic classes, then use opaque pre-mixed hex/rgb colors (not alpha overlays), because class distinction must stay stable on dark UI backgrounds.

## Examples

### Positive

- `conditionalStrong` uses a solid light-red hex (`#efb8bf`) distinct from `strong` and `overpair`.
- Legend swatch and bar segment render the same perceived color.

### Anti-pattern

- Using `rgba(227, 74, 85, 0.45)` for a dark-themed bar where it blends into brown.
- Picking colors that are only distinct on white but collapse on dark green bars.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
