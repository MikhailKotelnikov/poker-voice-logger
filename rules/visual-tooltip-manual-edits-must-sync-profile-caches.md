# Title

Tooltip Manual Edits Must Patch In-Memory Profile Caches

## Problem

Manual HH edits can be persisted in DB but still disappear when tooltip is closed and reopened from the same rendered profile, because chart/list caches keep stale `profile_sample_v2` payloads until a full filter refresh.

## Rule

When a manual HH field or timing is saved/cleared in tooltip UI, then patch matching `profile_sample_v2` payloads and list rows in in-memory profile caches immediately, because existing row event handlers reuse cached sample arrays between renders.

## Examples

### Positive

- Save `hand_presupposition`, close pinned tooltip, reopen same sample from bar, and value remains visible.
- No filter toggle is required to see just-saved manual text/timing in the same profile view.

### Anti-pattern

- Updating only DB and pinned tooltip source while leaving chart/list cache payloads stale.
- Value appears only after page refresh or filter switch.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
