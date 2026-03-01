# Title

HH Reupload After Sheet Reset Must Start From Zero

## Problem

If an old checkpoint is reused after the user clears Google Sheet rows, resumed upload can skip the beginning of the recalculated batch.

## Rule

When the user requests a full reupload after clearing table data, then start a new run ID and initialize upload cursor to `0` (ignore prior checkpoints), because a reset table requires replaying the entire recalculated dataset.

## Examples

### Positive

- Create `/tmp/hh_21_02_upload_progress_recalc_20260222b.json` with `cursor: 0` and upload all rows from index 1.

### Anti-pattern

- Reusing `/tmp/hh_21_02_upload_progress_<old>.json` with `cursor > 0` after sheet cleanup.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
