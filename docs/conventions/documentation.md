---
title: Documentation Conventions
type: reference
last_reviewed: 2026-04-24
authorising_adr: 0005, 0006
---

# Documentation Conventions

Authorised by [ADR 0005](../adr/0005-agents-md-primary.md) and [ADR 0006](../adr/0006-documentation-shapes.md).

## Layout

```
<repo>/
├── README.md                — human quickstart (~100 lines)
├── AGENTS.md                — primary agent context (~100 lines, 7 sections)
├── CLAUDE.md                — @AGENTS.md pointer (~20 lines)
├── CHANGELOG.md             — release-please generated
├── LICENSE                  — MIT default
├── SECURITY.md              — vuln disclosure
├── CODEOWNERS
└── docs/
    ├── README.md            — docs index
    ├── architecture.md      — one-page overview + mermaid diagram
    ├── adr/                 — decisions (append-only, MADR format)
    ├── plans/               — active + archived implementation plans
    ├── runbooks/            — operational procedures with staleness frontmatter
    ├── conventions/         — deeper reference (code-style, layering, etc.)
    ├── reference/           — AUTO-GENERATED API docs (OpenAPI, wire types)
    └── user-guide/          — OPTIONAL: Docusaurus/VitePress for end-user docs
```

## AGENTS.md shape (strict, 7 sections)

1. **Overview** — 1-2 sentences
2. **Tech Stack** — table
3. **Commands** — bash block
4. **Structure** — file tree or bullets
5. **Critical Context** — ≤10 terse bullets, non-obvious invariants
6. **Design Decisions** — links to `docs/adr/`
7. **Known Issues** — dated list

**~100 lines max.** `last_reviewed` frontmatter.

## CLAUDE.md shape (thin)

```markdown
@AGENTS.md

## Claude-specific
- <Claude-only directives>
- <under 20 lines>
```

## ADR shape

See [`docs/adr/TEMPLATE.md`](../adr/TEMPLATE.md).

Rules:
- **Numbered sequentially** from 0001.
- **Append-only**. Never rewrite; supersede.
- **One decision per ADR.**
- **Status lifecycle**: `proposed` → `accepted` | `rejected` | `deprecated` | `superseded by ADR-NNNN`.

## Plan shape

See [`docs/plans/TEMPLATE.md`](../plans/TEMPLATE.md).

Rules:
- **Dated filename**: `YYYY-MM-DD-<slug>.md`.
- **Lives in `active/`** while in flight.
- **Moved to `archived/`** on completion or abandonment.
- `active/` should rarely hold > 3 plans.

## Runbook shape

See [`docs/runbooks/TEMPLATE.md`](../runbooks/TEMPLATE.md).

Rules:
- **Prereqs / Steps / Verify / Rollback** mandatory sections.
- **`last_reviewed` and `last_executed` frontmatter** mandatory.
- **Tested periodically** — CI opens issue if `last_reviewed` > 90 days.

## Five shapes and no sixth

Any file in `docs/` (outside `reference/` and `user-guide/`) must be one of: README, AGENTS.md, ADR, Plan, Runbook. Free-form prose is rejected in PR review. See [ADR 0006](../adr/0006-documentation-shapes.md).

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

Over the target, split. Over the hard max, an ADR is required for the exception.

## Auto-generated reference

`docs/reference/` contains:
- `openapi.json` — generated from code (tsoa / @fastify/swagger / zod-openapi).
- `wire-types.md` — generated from `@scope/types` via TypeDoc → markdown.
- `cli.md` — generated from `<cli> --help`.

**Hand-editing files in `docs/reference/` is rejected.** Edit the source; CI regenerates.

CI workflow (`.github/workflows/reference-gen.yml`) runs on any commit touching generator sources.

## Drift detection

### Docs-drift workflow

`.github/workflows/docs-drift.yml`:
- Triggers on PRs touching source files.
- Reads `.github/docs-mapping.json` to find which doc pages relate to changed files.
- Mechanical drift (deterministic fix): @claude auto-updates the doc in the PR.
- Prose drift (judgement required): creates a `documentation` issue.

### Staleness workflow

`.github/workflows/docs-staleness.yml` (weekly):
- Scans frontmatter across `docs/`.
- Opens an issue for:
  - Runbooks with `last_reviewed` > 90 days
  - ADRs with `Status: proposed` > 14 days
  - Plans in `active/` untouched > 30 days
  - AGENTS.md with `last_reviewed` > 180 days

### Reconciliation

`/reconcile` skill (or scheduled workflow) checks:
- Stale technology references (terms that should no longer appear)
- Broken internal links
- Orphan docs (not linked from any index)
- ADRs referencing files that no longer exist

## Per-package documentation (monorepo)

Each package has:
- **`<package>/README.md`** — thin (30 lines), links to root.
- **`<package>/AGENTS.md`** — package-specific context, ~60 lines. Extends root AGENTS.md.

**Never** duplicate root content in package files. Package docs are **deltas**.

## Documentation review

- **Same PR review discipline** as code. Typos + broken links block.
- **Cross-link liberally** — README references AGENTS.md references ADRs.
- **Prefer tables over prose** for reference material.
- **Diagrams in mermaid** (renders in GitHub natively, survives grep).
- **Code examples must run** — lintable snippets preferred.

## What NOT to document

- **Self-evident style rules** ("write clean code"). Linter handles these.
- **Tutorial walkthroughs inside the repo.** If needed, they belong in `user-guide/` (separate site).
- **"How it works" prose explanations of well-named code.** The code and types should tell the story.
- **Every-file header comment.** Noise.
- **License blocks in every file.** Single LICENSE at root suffices.
- **Change logs per file / per directory.** CHANGELOG at root.
