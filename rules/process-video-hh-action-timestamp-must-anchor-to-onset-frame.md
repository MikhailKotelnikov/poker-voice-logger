# Title

Video-HH Action Timestamp Must Anchor To Onset Frame

## Problem

With sparse sampling, action can be detected only after turn focus has already moved, so event timestamps drift late and degrade sequence analysis.

## Rule

When an action appears across adjacent sampled frames, then assign event time to the earliest frame that supports the action onset (or nearest pre-transition frame), because post-transition timestamps misrepresent who acted when.

## Examples

### Positive

- `all-in` detected at frame N while turn already moved; timestamp is anchored to frame N-1 if onset evidence exists there.

### Anti-pattern

- Always timestamp action at the first OCR hit even if that frame already shows next player’s decision focus.

## Validation Checklist

- [ ] Event timestamping logic considers neighboring frames for onset.
- [ ] Turn-focus transition is used as boundary for late detections.
- [ ] Anchored timestamp is persisted in canonical `evidence.frame_ms`.
- [ ] Preview spot-check confirms reduced late-shift on all-in spots.
