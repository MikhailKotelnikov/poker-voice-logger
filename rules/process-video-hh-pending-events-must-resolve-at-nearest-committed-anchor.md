# Title

Video-HH Pending Events Must Resolve At Nearest Committed Anchor

## Problem

Uncertain actions are often forced into committed output too early, causing later contradictions when the next reliable frame arrives.

## Rule

When action evidence is insufficient for commit, then store event as `pending/inferred` and resolve it only at the nearest committed anchor (pot jump, street transition, terminal lock, or confirmed response), because anchor-based resolution preserves legal chronology without hallucinating immediate certainty.

## Examples

### Positive

- Repeated `CALL` tokens at stable pot are kept pending and resolved after flop transition confirms preflop response completion.

### Anti-pattern

- Convert every repeated action token into committed events before any anchor confirms that the decision was finalized.

## Validation Checklist

- [x] Specific and testable
- [x] Reusable in future tasks
- [x] Not duplicated elsewhere

