# Title

Paired Board Must Downgrade `2p` To Pair Class In HH Notes

## Problem

Omaha evaluator can output `2p` on paired boards from board-pair + single hole match. In this project notation that overstates hand strength and pollutes visual color buckets.

## Rule

When showdown class on a street is `2p` and the board on that street is paired, then downgrade class token to `p`, because paired-board `2p` must not be treated as a true two-pair class in this notation.

## Examples

### Positive

- Board `As Ad 7c`, hand `7h Tc 9d 4c 3h` -> stored as `_p`, not `_2p`.
- Existing `full/str/set` classes on paired boards remain unchanged.

### Anti-pattern

- Keeping `_2p` on paired boards and coloring as orange `two pair`.
- Mixing paired-board pseudo-two-pair rows into real `2p` stats.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
