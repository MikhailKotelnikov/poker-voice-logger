# Title

Promoting Experimental Server To Main Must Archive Previous Entrypoints

## Problem

When a faster experimental server is promoted to production entrypoint without archiving previous runtime files, rollback becomes risky and teams lose a known-good fallback for incident recovery.

## Rule

When promoting an experimental server implementation to the main runtime entrypoint (`server.js`), then archive the previous main server and previous experimental entrypoint under a stable archive path and keep explicit npm scripts for rollback runs, because migration safety requires a reversible runtime switch.

## Examples

### Positive

- Copy current `server.js` into `archive/servers/server-baseline-legacy.js`, copy experimental runner into `archive/servers/server-quality-first.js`, switch `server.js` to the new implementation, and keep `start:archive-*` scripts.

### Anti-pattern

- Replace `server.js` directly with experimental code and delete old entrypoints, leaving no runnable rollback path.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
