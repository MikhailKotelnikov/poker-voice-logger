# Title

Video-HH Preflop Squeeze Response Chain Must Be Complete Before Street Transition

## Problem

Extractor can detect open/cold-call/squeeze but skip required reaction actions (fold/call/4-bet) from earlier actors, which breaks preflop sequence integrity.

## Rule

When preflop squeeze context is detected (open raise followed by cold call and re-raise), then enforce response-chain completion for impacted actors before transitioning to flop state, because missing squeeze responses creates false action timelines and lost key events.

## Examples

### Positive

- Sequence includes: `AbbyMartin raise`, `ZootedCamel call`, `ilsy raise (squeeze)`, then explicit responses (`AbbyMartin fold`, `ZootedCamel call/fold`).

### Anti-pattern

- Extract squeeze event and immediately move to next street while opener/cold-caller responses are absent.

## Validation Checklist

- [ ] Squeeze context detection is explicit in preflop flow state.
- [ ] Missing required responses are flagged and not silently skipped.
- [ ] Street transition requires completed response chain or explicit unresolved marker.
- [ ] Preview review shows preserved squeeze reaction events.
