# Title

Video-HH Sampling Must Use 1s Baseline With Adaptive Refinement On Pot Jumps

## Problem

Coarse sampling (for example 5 seconds) skips multiple actions and breaks action reconstruction because pot/stack transitions happen between sampled frames.

## Rule

When extracting events from recorded poker video, then use a 1-second baseline sampling step and trigger local re-sampling with a finer step on suspicious pot jumps between adjacent frames, because dense baseline coverage plus targeted refinement reduces missed actions without forcing full sub-second OCR across the whole video.

## Examples

### Positive

- Baseline pass uses `sample_ms=1000`.
- If pot grows sharply between two adjacent sampled frames, extractor runs a local refinement pass inside that interval with a smaller step and merges extra frames.

### Anti-pattern

- Run the entire video at `sample_ms=5000` and accept large pot deltas with no interval refinement.

## Validation Checklist

- [x] Specific and testable
- [x] Reusable in future tasks
- [x] Not duplicated elsewhere
