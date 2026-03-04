# Title

Visual Profile List Voice Rows Must Map Presupposition And Date

## Problem

In list-mode tooltip rendering, voice-origin rows can lose `PRESUP` text and played-at metadata because only HH manual fields are mapped into the sample payload.

## Rule

When building list samples for `source=voice`, then map row `presupposition` into `manual.handPresupposition` and expose row date as `meta.playedAtUtc`, because UI rendering should show the same presupposition/date context for voice rows as for HH rows.

## Examples

### Positive

- Voice row with `presupposition="i gc"` renders `PRESUP: i gc` in tooltip.
- Voice row with `date="2026-02-07T17:45:51Z"` appears in sample meta as `playedAtUtc`.

### Anti-pattern

- Voice row shows `PRESUP: —` even though `presupposition` is present in source row.
- Date column is ignored, producing empty timestamp in list-mode meta/header.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
