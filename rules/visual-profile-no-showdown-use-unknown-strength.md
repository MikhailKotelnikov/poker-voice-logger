# Title

Visual Profile Must Separate No-Showdown Strength as Unknown

## Problem

Target actions without showdown-derived hand class were forced into `weak`, biasing profile color distribution and hiding uncertainty.

## Rule

When classifying hand strength for visual buckets and no explicit made/draw/weak class tokens are present, then classify as `unknown` (white segment), because no-showdown lines must not be misrepresented as weak made value.

## Examples

### Positive

- `UTG_player cb50 onQhTs5s` (no hand-class token) → `unknown` segment.
- `... KhJs9s8c7c_2p ...` → `strong`, not `unknown`.

### Anti-pattern

- Defaulting every unclassified line to `weak`.
- Mixing no-showdown action-only rows into green weak bucket.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
