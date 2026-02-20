# Title

Visual Profile Tooltip Samples and Streets

## Problem

Tooltip content in the visual profile can drift from bucket counts: duplicate hands get collapsed and only one street is shown, which hides context needed for manual verification.

## Rule

When building visual profile tooltip payloads, then keep one sample per counted hand (without de-dup by text) and include `preflop`, `flop`, `turn`, and `river` strings in each sample, because the tooltip must match bucket totals and show full line context.

## Examples

### Positive

- Two `strong` hands in bucket `2` produce two stacked tooltip entries.
- Hover sample shows all streets with `—` for empty streets, not only the focus street.

### Anti-pattern

- Dropping one of two equal-text samples because of `list.includes(sample)`.
- Sending only `flop` text in tooltip payload and hiding preflop/turn/river context.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
