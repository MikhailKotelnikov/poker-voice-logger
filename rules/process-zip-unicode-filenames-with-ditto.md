# Title

Zip Extraction With Unicode Filenames on macOS

## Problem

Some archives with non-ASCII filenames fail to unpack via `unzip` on macOS with `Illegal byte sequence`, which blocks downstream processing.

## Rule

When `unzip` fails on a `.zip` containing Unicode filenames, then extract with `ditto -x -k` into a clean target directory, because `ditto` handles filename encoding more reliably in this environment.

## Examples

### Positive

- `rm -rf /tmp/hh_21_02 && mkdir -p /tmp/hh_21_02 && ditto -x -k 21.02.zip /tmp/hh_21_02`

### Anti-pattern

- Retrying `unzip` repeatedly after `Illegal byte sequence` and proceeding with a partially extracted archive.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
