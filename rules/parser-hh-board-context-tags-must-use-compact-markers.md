# Title

HH Board Context Tags Must Use `*_BRD` Tokens Next To Board Cards

## Problem

Board-context tags mixed into hand suffixes (`..._STRB`, `..._pairedboard`) duplicate the same board info on every action and blur the boundary between hand-strength tags and board-state tags.

## Rule

When emitting board context in HH street notes, then place uppercase `*_BRD` tokens immediately after the `on<board>` token (`A_BRD`, `PAIRED_BRD`, `FD_BRD`, `FLUSH_BRD`, `STR_BRD`, `2FD_BRD`, `MONO_BRD`), because board semantics must be street-level metadata, not per-hand suffix metadata.

## Examples

### Positive

- `... KhKdQs9h2c_set on9cKcQd K_BRD STR_BRD FD_BRD`
- `... 5c6dAcAd2h_midstr on6c7d8h9sKs K_BRD STR_BRD`
- `... onAhKhQh A_BRD FLUSH_BRD MONO_BRD`

### Anti-pattern

- `KhKdQs9h2c_set_STRB`
- `..._lowstr_STRB`
- Repeating `PAIRED_BRD`/`FLUSH_BRD` inside every player hand suffix instead of next to `on...`.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
