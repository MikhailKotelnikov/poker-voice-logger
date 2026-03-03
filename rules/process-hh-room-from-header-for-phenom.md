# Title

HH Room For Phenom Poker Must Be Derived From Header Line

## Problem

Phenom Poker exports can use table names like `Glacium 6max` or `PLOBROTHERS` that are table labels, not room identifiers. If room is derived from `Table '...'`, filters and joins split the same room into many incorrect values.

## Rule

When a hand header starts with `Phenom Poker Hand #...`, then derive `room` from that header as `Phenom Poker` (and keep alphanumeric hand IDs from the same header), because this format encodes room identity in the first line while table names are not stable room namespaces.

## Examples

### Positive

- `Phenom Poker Hand #84fb311b1db1: ...` with `Table 'Glacium 6max' ...` -> `room=Phenom Poker`, `hand_number=84fb311b1db1`.
- `Phenom Poker Hand #db20f81eebce: ...` with `Table 'PLOBROTHERS' ...` -> `room=Phenom Poker`.

### Anti-pattern

- Saving `room=Glacium` or `room=PLOBROTHERS` for Phenom hands.
- Parsing only numeric hand IDs and dropping alphanumeric IDs like `84fb311b1db1`.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
