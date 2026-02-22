# Title

Sheets Batch Upload Must Use Timeout and Checkpoint

## Problem

Large sequential uploads to Apps Script can hang on one network call and lose progress if the process is interrupted.

## Rule

When uploading many rows to Google Sheets through Apps Script, then send rows with per-request timeout, limited retries, and a persisted cursor checkpoint, because resumable batches prevent duplicate work and incomplete imports.

## Examples

### Positive

- Save progress after each row (`cursor`, `uploadedRows`, `errors`) and resume from `cursor` after restart.
- Use request timeout (for example 20s) and retry each failed row up to 3 times before recording an error.

### Anti-pattern

- Running one long loop without timeout/checkpoint so a single stalled request blocks the whole import.
- Restarting from row 1 after interruption and risking duplicate inserts.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
