# Title

Pinned Tooltip Edits Must Sync Source Sample Payload

## Problem

Pinned tooltip re-render uses `profileTooltipSampleInput` as source. If manual edits update only in-memory parsed objects, re-render restores stale values and looks like save failed.

## Rule

When manual fields or timings are changed in a pinned tooltip, then update the matching `profile_sample_v2` payload in `profileTooltipSampleInput` before re-rendering, because pinned refresh must read the latest manual state instead of stale snapshot text.

## Examples

### Positive

- After saving `flop` note, update payload `manual.flop` and then call tooltip refresh.
- After clearing timings, remove/replace payload `timings` and then refresh.

### Anti-pattern

- Call `refreshPinnedProfileTooltip()` immediately after save without patching source payload.
- UI briefly shows new value, then snaps back to old value.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
