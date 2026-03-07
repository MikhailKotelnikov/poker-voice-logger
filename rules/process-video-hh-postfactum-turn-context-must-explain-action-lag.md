# Title

Video-HH Postfactum Turn Context Must Explain Action Timestamp Lag

## Problem

Many actions are visible only after focus moved to the next player, which can look like wrong ordering unless extractor models postfactum observation explicitly.

## Rule

When an action is inferred from a frame where turn focus already moved to the next actor, then interpret it as postfactum completion of the previous actor's decision and preserve coherent turn order, because frame sampling observes outcomes after the click moment.

## Examples

### Positive

- Focus is now on `MrLouie`, but previous frame state implies `AbbyMartin raise`; extractor records raise as prior completed action and sets current actor to `MrLouie` deciding.

### Anti-pattern

- Treat focus-owner and action-owner as always identical in sampled frame and overwrite prior action chronology.

## Validation Checklist

- [ ] Focus-owner and action-owner can differ in postfactum frames.
- [ ] Extractor preserves legal action order despite frame lag.
- [ ] Inference logic documents or encodes postfactum completion behavior.
- [ ] Preview review does not show impossible turn jumps.
