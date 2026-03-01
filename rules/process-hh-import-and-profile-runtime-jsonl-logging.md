# Title

HH Import And Profile Endpoints Must Emit Runtime JSONL Logs

## Problem

Large HH imports and profile rendering failures are hard to diagnose from UI-only errors (`Failed to fetch`) without structured runtime traces.

## Rule

When implementing HH folder import or visual profile endpoints, then emit append-only JSONL runtime events for start/progress/error/completion, because operational debugging needs correlated, machine-readable traces from production runs.

## Examples

### Positive

- Import writes `import.start`, periodic `import.progress`, `import.hand.error`, and `import.done` to `logs/hh-import.log`.
- Profile endpoint writes `profile.request.start` and `profile.request.error` to `logs/visual-profile.log`.

### Anti-pattern

- Only console logs or generic UI errors are available, so root cause of failed imports/profiles cannot be reconstructed after the fact.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
