# Title

Verify Linked Resources After Third-Party Skill Install

## Problem

Some third-party skills ship with symlinked `data/` or `scripts/` paths; direct download install can leave broken text links and make the skill partially unusable.

## Rule

When installing a skill from an external repository, then verify that required resources (`scripts`, `data`, templates) are real directories/files and runnable, because successful install output alone does not guarantee functional skill assets.

## Examples

### Positive

- After install, run `ls` on skill resources and execute at least one script help command (for example `search.py --help`) to confirm wiring.

### Anti-pattern

- Trust "Installed <skill>" message and skip resource validation.

## Validation Checklist

- [ ] Required resource paths exist as expected (not broken link placeholders).
- [ ] At least one skill script command runs successfully.
- [ ] Any broken links are repaired before using the skill in production tasks.
