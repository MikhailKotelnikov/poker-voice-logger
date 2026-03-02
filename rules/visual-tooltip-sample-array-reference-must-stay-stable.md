# Title

Tooltip Sample Array Reference Must Stay Stable During Live Patch

## Problem

Chart/list segment handlers keep references to `tooltipSamples` arrays created at render time. If live-save code replaces that array object (instead of mutating it), later tooltip reopen events can read stale sample text and hide newly saved manual fields until full profile reload.

## Rule

When patching tooltip samples after HH manual save, then update existing sample arrays in place and preserve their reference, because rendered handlers may still point to the original array object between view refreshes.

## Examples

### Positive

- Update `profileTooltipSampleInput[index]` in a loop and keep the same array instance.
- After saving multiple fields in one hand, closing and reopening the same tooltip shows all saved fields without filter toggle.

### Anti-pattern

- `profileTooltipSampleInput = profileTooltipSampleInput.map(...)` replaces the array object while handlers still reference the old one.
- First saved field appears, later fields are missing until full profile re-render.

## Validation Checklist

- [x] Specific and testable
- [x] Reusable in future tasks
- [x] Not duplicated elsewhere
