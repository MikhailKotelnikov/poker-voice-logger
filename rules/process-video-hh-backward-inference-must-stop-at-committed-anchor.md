# Title

Video-HH Backward Inference Must Stop At Committed Anchor

## Problem

Unlimited backward fill can rewrite already-stable history and introduce impossible sequences when trying to recover missed fast actions.

## Rule

When reconstructing missing earlier actions from a later frame, then backtrack only until the nearest committed anchor and stop, because committed anchors define stable boundaries that prevent retroactive corruption of validated chronology.

## Examples

### Positive

- On flop start, infer one missing preflop response only within the open-squeeze-response window and stop at the committed squeeze anchor.

### Anti-pattern

- Continue backward insertion across multiple prior committed actions and reorder already validated events.

## Validation Checklist

- [x] Specific and testable
- [x] Reusable in future tasks
- [x] Not duplicated elsewhere

