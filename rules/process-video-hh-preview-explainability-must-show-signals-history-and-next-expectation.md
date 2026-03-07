# Title

Video-HH Preview Explainability Must Show Signals, Locked History, And Next Expectation

## Problem

Without an explicit explainability layer in preview, manual QA sees only final actions and cannot validate why an event was committed/inferred or what transition logic the extractor followed.

## Rule

When generating Video-HH preview for review, then each rendered event must include a deterministic trace with observed signals, decision state, locked past context, and next-step expectation, because this makes regression checks reproducible without reading source code.

## Examples

### Positive

- Preview row includes: `observed: focus/pot/confidence`, `decision: committed|inferred`, `past_locked: ...`, `expected: ...`.

### Anti-pattern

- Preview shows only `actor/action` table without signal-level explanation or expected next transition.

## Validation Checklist

- [ ] Row-level trace is present for each rendered event in explainability mode.
- [ ] Trace includes observed signals and decision state.
- [ ] Trace includes locked previous context within the hand.
- [ ] Trace includes next-step expectation with observed-next comparison when available.
