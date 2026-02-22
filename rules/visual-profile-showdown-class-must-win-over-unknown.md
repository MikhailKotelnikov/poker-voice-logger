# Title

Showdown Class Tokens Must Override Unknown In Visual Strength

## Problem

Rows with explicit made-hand tags (for example `set`) can appear as `unknown` when fallback classification paths ignore parsed class tokens.

## Rule

When classifying visual strength, then always prioritize explicit showdown class tokens (`set`, `2p`, `full`, draw tags, etc.) before any no-showdown fallback, because known hand classes must never be painted as unknown.

## Examples

### Positive

- `... Kc5d5h3c6d_set_oe ...` → strong made color, not unknown.
- `... AsKdQh9c8c_2p ...` → two-pair color, not unknown.

### Anti-pattern

- Returning `unknown` while street text still contains `_set`.
- Applying unknown fallback first and shadowing explicit class tags.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
