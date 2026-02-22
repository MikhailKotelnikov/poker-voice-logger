# Title

Visual Miss Check-Fold Lines Must Map To `Lx`

## Problem

Miss buckets in visual profile were showing `unknown` (white) for no-showdown lines where target checked and later folded, which hid clear conditional weakness and produced misleading flop miss color mixes.

## Rule

When a no-showdown target line contains a fold on flop/turn/river (including passive check-fold sequences without prior target aggression), then classify the line as `Lx` (`Lf`/`Lt`/`Lr`) and render it as `lightFold`, because later fold outcome is an explicit weak realization signal even if the target never bet.

## Examples

### Positive

- `flop: BB_hero x ... / BTN_villain cb71 / BB_hero f` -> flop `Miss` counted as `lightFold`.
- `flop: ... x/x`, `turn: ... x/x`, `river: ... b31 / hero f` -> flop `Miss` counted as `lightFold` (`Lr`).
- Multiway line with target check-fold on flop -> `Flop Bets -> MW -> Miss` uses `lightFold`, not `unknown`.

### Anti-pattern

- Requiring prior target bet/raise before assigning `Lx`.
- Leaving passive check-fold no-showdown lines in white `unknown`.
- Counting HU correctly but leaving MW miss check-fold lines as unknown.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
