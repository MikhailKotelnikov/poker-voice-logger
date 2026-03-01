# Title

HH Folder Import Must Prune Empty Input Directories After Move

## Problem

After moving processed HH files to `imported`, nested empty folders remain in `import` (often with only `.DS_Store`), which makes operators think files are still pending.

## Rule

When folder-based HH import finishes moving files, then recursively remove empty directories (and ignorable artifacts like `.DS_Store`) from the input tree while preserving the root folder, because inbox state must clearly reflect only unprocessed files.

## Examples

### Positive

- `import/2026/2025/12/21/file.txt` is moved to `imported/...`; `import/2026/2025/12/21` is removed if empty.
- `.DS_Store` is deleted so parent directories can be pruned.

### Anti-pattern

- Files are moved, but empty nested folders remain under `import`, causing false “pending import” signals.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
