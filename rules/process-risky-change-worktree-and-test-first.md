# Title

Risky Changes Use Worktree And Test-First

## Problem

High-impact refactors done in the main working tree without test-first discipline increase merge risk and make rollback/debug harder.

## Rule

When a task is high risk (core parser refactor, data-model change, or wide cross-module edits), then execute it in a dedicated `git worktree` branch and start with failing tests before implementation, because isolation plus red-green verification reduces blast radius.

## Examples

### Positive

- Create `codex/<topic>` in a separate worktree, write failing tests for expected behavior, implement until tests pass, then run the verify gate.

### Anti-pattern

- Refactor core parsing directly in the current branch without a separate worktree and without first defining failing tests.

## Validation Checklist

- [ ] Risk level was assessed before coding.
- [ ] Dedicated worktree branch was used for risky work.
- [ ] Failing tests were written before implementation.
- [ ] Verify Gate was run before completion.
