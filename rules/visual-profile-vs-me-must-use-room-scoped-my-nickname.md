# Title

Profile VS-Me Filter Must Use Room-Scoped My Nickname

## Problem

Persisting the last arbitrary `VS игрок` value causes stale opponent filters to appear by default and makes quick "vs me" analysis inconsistent across poker rooms.

## Rule

When rendering HH profile filters, then keep `VS игрок` empty by default and drive `VS me` mode from a room-scoped `my nickname` value (saved per room), because users need predictable "all vs filtered" behavior and one-click self-match per room.

## Examples

### Positive

- Opening profile starts with empty `VS игрок` and unchecked `VS me`.
- User sets `my nickname` for `cpr` once, then `VS me` checkbox instantly applies that nickname to the VS filter.
- Switching room uses that room’s saved nickname, not the previous room value.

### Anti-pattern

- Reusing last typed VS nickname as default on every open.
- Storing one global `my nickname` for all rooms and applying wrong self-filter in another room.

## Validation Checklist

- [ ] Specific and testable
- [ ] Reusable in future tasks
- [ ] Not duplicated elsewhere
