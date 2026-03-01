# Title

Desktop Launcher Must Persist Runtime Config And Bootstrap HH DB

## Problem

Desktop builds break or lose state when server paths are hardcoded to project-relative files; users cannot safely update installers or move import folders without manual reconfiguration.

## Rule

When packaging the app for desktop installation, then persist launcher settings in a user-level runtime directory and start the server with `HH_DB_PATH`/auto-import env values from that runtime config (bootstrapping DB file on first run), because updates must preserve data and keep import behavior deterministic across installs.

## Examples

### Positive

- Launcher stores config in `%APPDATA%/.../launcher-config.json`, ensures `hh.db` exists in runtime folder, and restarts server with updated `HH_IMPORT_INBOX_DIR` after user saves settings.

### Anti-pattern

- Installer writes DB/config inside app install directory and server continues reading default `./data/hh.db`, causing resets or broken paths after reinstall.

## Validation Checklist

- [ ] Launcher writes config to user runtime directory, not install directory.
- [ ] First run creates or copies runtime DB before server startup.
- [ ] Server process receives runtime `HH_DB_PATH` and auto-import env values.
- [ ] Saving launcher settings applies on next server start without manual file edits.
