# Title

Board Context Tags Must Use Compact Marker Tokens

## Problem

Using underscored board-context tags (`str_board`, `flush_board`) in the same suffix stream as class tags (`str`, `set`) creates ambiguity and inconsistent parsing/reading in notes and profile UI.

## Rule

When appending board-context metadata to HH hand-class suffixes, then use compact marker tokens without internal underscores (`STRB`, `FLB`, `pairedboard`) and attach qualifiers via separator underscore (for example `lowstr_STRB`), because class tags and board-context tags must stay unambiguous.

## Examples

### Positive

- `KhKdQs9h2c_set_STRB`
- `5cTdAcAd2h_str_lowstr_STRB`
- `AhKhQd9d4h_flush_pairedboard`

### Anti-pattern

- `KhKdQs9h2c_set_str_board`
- `..._str_lowstr_board`
- Mixing both `str_board` and `STRB` in one dataset.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
