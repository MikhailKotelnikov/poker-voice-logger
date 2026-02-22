# Title

Visual Class Tags Must Be Parsed From Hand Suffix Tokens

## Problem

Street strings contain many underscores in actor ids (for example `HJ_player`), so naive underscore parsing can capture nickname fragments instead of real hand-class tags (`_set_oe`, `_2p_g`) and misclassify strengths as unknown.

## Rule

When extracting class tokens for visual strength, then parse tags only from packed-card suffix patterns (for example `KhJs9s8c7c_2p_g`) and tokenized class markers, because actor-id underscores are not semantic hand classes.

## Examples

### Positive

- `HJ_hero b68 AhTc9d4c3h_2p_g onAsKd7c` -> classified as `twoPair`.
- `SB_villain c KdQhJs8d7c_set_fd_oe` -> classified as `strong`/draw-aware, not unknown.

### Anti-pattern

- Reading first `_...` token from full street and getting `hero` from `HJ_hero`.
- Missing `_2p_g` because regex expects word-boundary after `2p` and ignores `_g`.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
