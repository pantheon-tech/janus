---
title: Documentation Shapes
type: reference
last_reviewed: 2026-04-24
---

# Documentation Shapes

Every file under `docs/` (excluding `docs/reference/` for auto-generated artefacts and `docs/user-guide/` for end-user content) is one of **five shapes**. No sixth.

## The five

| Shape | Location | Purpose | Lifecycle |
|---|---|---|---|
| README | any directory | Orient a first-time reader | Living |
| AGENTS.md | repo root + per-package | Primary agent context | Living, `last_reviewed` frontmatter |
| ADR | `docs/adr/` | Record an architectural decision | **Append-only**; supersede via new ADR |
| Plan | `docs/plans/` | Implementation plan | Living: `active/` → `archived/` |
| Runbook | `docs/runbooks/` | Operational procedure | Living, `last_reviewed` + `last_executed` frontmatter |

## Frontmatter

Required on AGENTS.md, Plans, Runbooks:

```yaml
---
title: <Title>
type: agents | plan | runbook
last_reviewed: YYYY-MM-DD
last_executed: YYYY-MM-DD    # runbooks only
owners: [<github-handle>]
---
```

## ADR shape

[MADR](https://adr.github.io/madr/). Numbered sequentially from 0001. **Append-only** — never rewrite an accepted ADR; supersede via a new ADR that links back.

ADRs document **architectural decisions specific to this project** — not the conventions janus already provides. If a deviation from a janus convention is the decision, that's an ADR. If it's "we use TypeScript", that's not.

Status lifecycle: `proposed` → `accepted` | `rejected` | `deprecated` | `superseded by ADR-NNNN`.

## Plan shape

Filename: `YYYY-MM-DD-<slug>.md`. Lives in `active/` while in flight; moves to `archived/` on completion or abandonment. `active/` should rarely hold > 3 plans.

## Runbook shape

Mandatory sections: Prereqs, Steps, Verify, Rollback. Frontmatter `last_reviewed` and `last_executed` required.

Re-review every 90 days minimum. `docs-staleness.yml` opens an issue when overdue.

## Auto-generated reference

`docs/reference/` contains only auto-generated artefacts:

- `openapi.json` — from code (zod-openapi or equivalent)
- `wire-types.md` — from `@<org>/types` via TypeDoc
- `cli.md` — from `<cli> --help`

Hand-editing files in `docs/reference/` is rejected in PR review. Edit the source; CI regenerates.

## User-facing documentation

`docs/user-guide/` is the one escape hatch for free-form prose, and only for end-user-facing content (Docusaurus, VitePress, mkdocs).

## Length caps

| Shape | Target | Hard max |
|---|---|---|
| README | 100 lines | 200 |
| AGENTS.md (root) | 100 lines | 150 |
| AGENTS.md (per-package) | 60 lines | 100 |
| CLAUDE.md | 20 lines | 40 |
| ADR | 100 lines | 250 |
| Plan | 100 lines | 200 |
| Runbook | 100 lines | 200 |

Above target: split. Above hard max: an ADR justifies the exception.

## What does NOT belong in docs/

- Self-evident style rules ("write clean code"). The linter handles these.
- Tutorial walkthroughs inside the repo. Use `docs/user-guide/` if needed.
- "How it works" prose explanations of well-named code. The code and types tell the story.
- Per-file header comments. Noise.
- License blocks per file. Single LICENSE at root suffices.
- Per-file changelogs. Single CHANGELOG at root.
