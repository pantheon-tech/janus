# Runbooks

Step-by-step operational procedures.

## Discipline

- **Every runbook has `last_reviewed` and `last_executed` dates** in frontmatter.
- **Tested periodically** — a runbook untested for > 90 days is suspect.
- **Rollback section is mandatory** — if the procedure goes wrong, how do we recover?
- **Prereqs listed** — required access, required state.

## Index

| Runbook | Purpose | Last reviewed |
|---|---|---|
| [rotate-secrets.md](./rotate-secrets.md) | Rotate a secret in Key Vault | 2026-04-24 |

See [TEMPLATE.md](./TEMPLATE.md) for the shape.
