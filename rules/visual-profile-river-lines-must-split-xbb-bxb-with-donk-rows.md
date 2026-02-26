# Title

River Lines Must Split XBB and BXB With Dedicated Donk Rows

## Problem

A single river `BetBet` bucket mixed distinct action trees and hid meaningful differences between continuation lines and river leads into prior-street aggressor.

## Rule

When building river profile sections, then split into `Check-Bet-Bet` (`x-b-b`) and `Bet-Check-Bet` (`b-x-b`) columns, and represent river donk opportunities as dedicated `Donk` / `Miss Donk` rows (not sizing buckets), because these decisions are line-structure signals rather than sizing-frequency signals.

## Examples

### Positive

- `x/x flop -> target b turn -> target x river` -> `Check-Bet-Bet Miss`.
- `target b flop -> x/x turn -> target b river` -> `Bet-Check-Bet`.
- `... turn aggressor bets, target calls -> river target leads first` -> `Donk` row.

### Anti-pattern

- Merging `x-b-b` and `b-x-b` into one river section.
- Spreading donk actions into `2/3/5/6/7/P` sizing rows.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
