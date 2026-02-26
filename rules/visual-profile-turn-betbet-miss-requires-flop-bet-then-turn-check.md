# Title

Turn BetBet Miss Requires Flop Bet Then Turn Check

## Problem

`BetBet Miss` was overcounted in turn analytics when lines without flop initiative (or without a turn check decision) were treated as missed continuation bets.

## Rule

When classifying turn `BetBet`/`BetBet Miss`, then count `BetBet Miss` only for lines where the target bet flop and then checked turn (with observed turn action), because this bucket represents missed second barrel after owning flop initiative.

## Examples

### Positive

- `flop: target cb50`, `turn: target xb` -> `BetBet Miss`.
- `flop: target cb50`, `turn: target b60` -> `BetBet`.

### Anti-pattern

- Counting `x-b-x` as `BetBet Miss`.
- Counting turn fold/call without turn check as `BetBet Miss`.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
