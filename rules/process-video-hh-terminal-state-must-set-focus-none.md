# Title

Video-HH Terminal Hand State Must Set Focus To None

## Problem

Using actor fallback on terminal rows falsely shows an active decision owner after final fold or all-in lock, which confuses QA and breaks turn-context semantics.

## Rule

When a hand reaches terminal resolution (single live player after final fold or all-in lock before showdown reveal), then set preview focus to `none` and block actor fallback focus assignment, because no player is actively deciding after terminal lock.

## Examples

### Positive

- Final flop fold occurs after all-in confrontation; row is emitted with actor=`ilsy fold` and focus=`none`.

### Anti-pattern

- Final row has no next frame, so preview sets focus to fallback actor (`ilsy`) as if action were still pending.

## Validation Checklist

- [x] Specific and testable
- [x] Reusable in future tasks
- [x] Not duplicated elsewhere

