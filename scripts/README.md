# scripts/

Maintenance + scaffolding scripts for janus itself.

## Scripts

| Script | Purpose | Status |
|---|---|---|
| `scaffold.sh` | Generate a new project from templates | **placeholder** |
| `version.sh` | Print current janus version | ready |

## Planned additions

- `validate-template.sh` — check every template file for valid slot syntax, missing files, etc.
- `update-hooks.sh` — propagate `templates/_shared/.claude/hooks/` changes to existing derived projects (opt-in).
