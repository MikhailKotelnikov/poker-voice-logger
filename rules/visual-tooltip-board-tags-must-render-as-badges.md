# Title

Visual Tooltip Board Tags Must Render As Badge Chips

## Problem

Board context tokens like `A_BRD` / `FD_BRD` become hard to scan when rendered as plain text, especially next to action and card blocks.

## Rule

When tooltip street extras contain `*_BRD` tokens, then render them as dedicated badge chips (separate from plain extra text and separate from hand-tag colors), because board context must be visually scannable and not mixed with free-form text.

## Examples

### Positive

- `on AhKhQh` followed by chips `A_BRD`, `FLUSH_BRD`, `MONO_BRD`.
- Non-board extras (for example `Sr`) remain plain text while board tags stay badges.

### Anti-pattern

- `A_BRD PAIRED_BRD FD_BRD` rendered as one plain text string.
- Rendering board tags with the same style as hand-strength tags, making meanings indistinguishable.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
