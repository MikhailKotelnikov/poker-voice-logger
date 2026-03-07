# Title

Video-HH Focus-First Detection Must Use Active Ring And Timebar As Primary Signal

## Problem

If extractor starts from OCR action text instead of current turn focus, stale seat badges can be mistaken for real actions and true acting player decisions are missed.

## Rule

When parsing decision frames, then first detect current action focus by seat highlight (ring/waves) plus burning decision timebar, and only then resolve action text for that focused actor, because focus ownership is the primary game-state signal.

## Examples

### Positive

- Frame shows waves and active timebar under `AbbyMartin`: extractor keeps turn on `AbbyMartin` and treats other seat badges as non-authoritative.

### Anti-pattern

- Frame focus is on `AbbyMartin`, but extractor emits `leeuw fold` from static badge text on another seat.

## Validation Checklist

- [ ] Focus detector is executed before action-token parsing.
- [ ] Focus signal combines seat highlight and/or decision timebar evidence.
- [ ] Event actor defaults to focused seat unless strong contradictory evidence exists.
- [ ] Preview spot-check confirms correct actor ownership on decision frames.
