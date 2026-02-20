# Title

HH Local Deterministic Import Without Semantic API

## Problem

Batch HH uploads through `/api/record-hand-history-files` depend on semantic LLM calls, which adds avoidable API cost when only deterministic HH notes are needed.

## Rule

When importing hand-history files in cost-sensitive mode, then parse each hand locally with `parseHandHistory`, pass empty parsed fields through `canonicalizeHandHistoryUnits`, finalize fields with `enrichHandHistoryParsed`, and send only resulting `preflop/flop/turn/river/presupposition` to Apps Script, because this keeps the project’s HH formatting logic while avoiding semantic API usage.

## Examples

### Positive

- Split `.txt` HH files into hands, run local deterministic parsing for each hand, then post rows to Sheets with `source: "hh"` and `opponent: "HH"`.

### Anti-pattern

- Calling `/api/record-hand-history-files` for bulk imports when semantic parsing is not required and API spend must be zero.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
