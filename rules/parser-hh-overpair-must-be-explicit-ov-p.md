# Title

Showdown Overpair Must Use `ov` Base Class With Optional `_p` Modifier

## Problem

Without explicit overpair tokenization, visual profile can miscolor overpairs as generic pair/weak. At the same time `_p` must stay a generic "pairs board" modifier, not part of overpair base class.

## Rule

When showdown street class is pair and target/opponent has pocket pair above board top rank with no board rank overlap, then emit base class `ov`, and append `_p` only if that same hand also pairs the board, because `ov` is overpair semantics while `_p` is a reusable board-pair modifier.

## Examples

### Positive

- Hand `AhAdKcQdJd` on flop `Td5h4c` -> class `ov`.
- Hand `AhAdTc7d5s` on board `Td5h4c` -> class `ov_p` (overpair + pair-to-board modifier).
- Visual classification of `... ov ...` and `... ov_p ...` goes to `overpair` bucket/color.

### Anti-pattern

- Emitting only `p` for pocket aces above flop.
- Always emitting `ov_p` even when hand does not pair board.
- Relying on street renderer to recover overpair solely from hidden hands row.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
