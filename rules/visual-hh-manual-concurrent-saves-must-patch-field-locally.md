# Title

HH Manual Concurrent Saves Must Patch Only The Edited Field

## Problem

When users save multiple HH manual fields in quick succession (for example `preflop` then `turn`), API responses can arrive out of order. Replacing the whole local `manual` object from one response can silently erase another just-saved field until full profile refresh.

## Rule

When processing HH manual save responses in the tooltip UI, then patch only the field that was edited by that request (not the full manual payload), because out-of-order responses must not overwrite other local fields.

## Examples

### Positive

- User saves `preflop`, then `turn`; responses return `turn` first, `preflop` second; UI still shows both fields without filter toggle.
- Save handler maps `apiField -> parsed.manual[key]` and updates only that key from response payload.

### Anti-pattern

- Save handler calls a full `setParsedManualFieldsFromApi(parsed, fields)` for every response; late `preflop` response restores stale `turn=""` and hides the second note until refetch.

## Validation Checklist

- [x] Specific and testable
- [x] Reusable in future tasks
- [x] Not duplicated elsewhere
