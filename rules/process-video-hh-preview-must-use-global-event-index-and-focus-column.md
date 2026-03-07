# Title

Video-HH Preview Must Use Global Event Index And Show Focus Actor

## Problem

Per-hand row numbering resets to `1` and hides timeline continuity, while missing focus context makes manual QA ambiguous about whose turn the frame represents.

## Rule

When generating preview tables for extracted video events, then number rows with a global monotonic index and include focus actor from event evidence, because reviewer validation depends on continuous ordering and explicit turn ownership context.

## Examples

### Positive

- Preview table has `# Global` increasing across all hands.
- Preview table also shows `# In Hand` and `Focus` columns for local and turn-context QA.

### Anti-pattern

- Table resets numbering for each hand and does not expose focus actor captured from frame cues.

## Validation Checklist

- [x] Specific and testable
- [x] Reusable in future tasks
- [x] Not duplicated elsewhere
