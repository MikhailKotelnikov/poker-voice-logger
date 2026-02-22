# Title

Clarify Gate Before Implementation

## Problem

Implementation often starts from ambiguous requests, which causes avoidable rework in parser, conversion, and visualization changes.

## Rule

When a task changes parsing, format conversion, visualization behavior, or touches more than one module, then run a Clarify Gate before coding (goal, input contract, output contract, edge cases, compatibility, tests, done criteria), because explicit assumptions prevent expensive rewrites.

## Examples

### Positive

- Before coding, capture: expected input hand-history variants, exact output fields/tokens, edge cases, and a testable done criterion.

### Anti-pattern

- Start coding from "make parser better" without specifying accepted input/output behavior.

## Validation Checklist

- [ ] Clarify Gate notes were written before code changes.
- [ ] Unknowns were resolved or marked as explicit assumptions.
- [ ] Done criteria are testable.
