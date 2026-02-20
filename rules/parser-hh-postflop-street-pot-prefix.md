# Title

HH Postflop Streets Must Carry Start-Pot Token

## Problem

Profile hover inspection needs street context, but postflop notes without explicit start-pot make it hard to validate sizing lines quickly.

## Rule

When serializing deterministic HH notes for `flop`, `turn`, or `river`, then prefix each street with `(<pot_bb>)` based on `streetStartPot/streetBlind`, because visual profile tooltip must show bank size before street actions.

## Examples

### Positive

- `"(56) SB_86761294 cb75 ... / CO_77031840 c ..."`
- `"(142) BB_12121116 x / SB_85033665 b9 / BB_12121116 c"`

### Anti-pattern

- `"SB_86761294 cb75 ..."` (no pot token).
- Putting pot only into presupposition instead of the street action string.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
