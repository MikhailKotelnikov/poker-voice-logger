# Title

BetBet And BetBetBet Must Be Derived From Street Sequence

## Problem

HH notes often do not contain explicit `bb`/`bbb` markers, so token-only detection leaves `BetBet` and `BetBetBet` sections empty.

## Rule

When populating `BetBet`/`BetBetBet`, then derive lines from target actions across `flop/turn/river` (bets count and river decision), because section semantics depend on action sequence, not on literal marker presence.

## Examples

### Positive

- `x flop -> b turn -> b river` counts as `BetBet`.
- `b flop -> x turn -> b river` counts as `BetBet`.
- `b flop -> b turn -> b river` counts as `BetBetBet`.
- `b flop -> b turn -> x river` counts as `BetBetBet Miss`.

### Anti-pattern

- Counting only rows that contain text token `bb`.
- Ignoring valid lines because actions are encoded as per-street `bXX` tokens.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
