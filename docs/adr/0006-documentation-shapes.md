# 0006 — Five and Only Five Documentation Shapes

- **Status**: accepted
- **Date**: 2026-04-24
- **Deciders**: @skipnz

## Context

Across surveyed projects, `docs/` directories accumulate:
- Free-form prose (design musings, brain dumps)
- Outdated architecture screenshots
- Half-written tutorials
- Orphan pages not linked from any index
- Duplicate content that diverges between copies

This rot is the default trajectory of docs. The specific failure modes:
- No canonical shape → every author invents theirs
- No lifecycle → old content sits next to new, undated
- No ownership → no one prunes

Writing docs is easy. Keeping them truthful is where every codebase fails.

## Decision

Every file under `docs/` (excluding `docs/reference/` for auto-generated API docs and `docs/user-guide/` for optional user-facing documentation sites) is **one of five shapes**. No sixth shape is permitted.

### The five shapes

| Shape | Location | Purpose | Lifecycle | Template |
|---|---|---|---|---|
| **README** | any dir | Orient a first-time reader | Living — updated when structure changes | — |
| **AGENTS.md** | repo root + per-package | Primary agent context | Living — `last_reviewed` frontmatter, re-reviewed every 6 months | `templates/_shared/AGENTS.md.tmpl` |
| **ADR** | `docs/adr/` | Record a significant decision | **Append-only** — never rewrite accepted ADRs; supersede via new ADR | `docs/adr/TEMPLATE.md` |
| **Plan** | `docs/plans/` | Work planned / in progress / archived | Living — moves `active/` → `archived/` on completion or abandonment | `docs/plans/TEMPLATE.md` |
| **Runbook** | `docs/runbooks/` | Operational procedure | Living — `last_reviewed` + `last_executed` frontmatter | `docs/runbooks/TEMPLATE.md` |

**Anything else is rejected in PR review.** Candidate content that doesn't fit:
- Tutorial-style "how the system works" prose → belongs in README or as an ADR documenting the design, not free prose.
- Design notes pre-decision → belongs in a Plan (and graduates to an ADR when decided).
- FAQs → are either README content, runbook content, or ADR consequences.

### Frontmatter

All shapes except README and ADR must carry YAML frontmatter:

```yaml
---
title: <Title>
type: agents | plan | runbook
last_reviewed: YYYY-MM-DD
last_executed: YYYY-MM-DD    # runbooks only
owners: [skipnz]
---
```

A scheduled workflow (`docs-staleness.yml`) reads frontmatter and opens issues for:
- Runbooks with `last_reviewed` > 90 days old
- ADRs in `Status: proposed` for > 14 days (proposal should decide)
- Plans in `active/` untouched for > 30 days
- AGENTS.md files with `last_reviewed` > 180 days old

### Auto-generated reference

`docs/reference/` contains **only auto-generated** artefacts:
- `openapi.json` — from code (tsoa, @fastify/swagger, zod-openapi)
- `wire-types.md` — generated from `@scope/types` via TypeDoc → markdown
- `cli.md` — generated from `cli --help`

Hand-editing files in `docs/reference/` is rejected in PR review. Changes are made in the source that generates them.

### User-facing documentation

`docs/user-guide/` is the **one escape hatch** for free-form docs — but only for end-user-facing content. Format: Docusaurus or VitePress. Optional per project.

## Consequences

### Positive
- **Rot is slower** because every shape has a lifecycle and a reviewer.
- **Findability** — contributors know where to look: decisions in ADRs, how-to in runbooks, status in plans.
- **PR review has teeth** — reviewers can reject content based on shape violations.
- **Scheduled drift detection** catches staleness before it becomes archaeology.

### Negative
- **Friction for small thoughts** — sometimes you just want to jot a note. The answer is: is this a decision (ADR), a plan (plan file), an invariant (AGENTS.md Critical Context), or a how-to (runbook)? If none, maybe you don't need to document it.
- **Rigidity** — occasional genuinely useful content won't fit. Case-by-case ADR override is the escape valve.
- **README inflation** — in the absence of other valid shapes, content creeps into README. Mitigated by README length cap (100 lines) and clear intent (orient, don't explain).

### Neutral
- **ADR append-only** feels unnatural at first ("I want to fix a typo") but the discipline prevents retroactive revisionism — important for decisions whose consequences matter.

## Considered Alternatives

- **Free-form `docs/` with only a README index** — rejected. Known failure mode across every surveyed project (including ones outside the surveyed set). Docs rot inevitable.
- **Docs-as-code with full CI enforcement (Markdown linters, link checkers)** — accepted as complementary. Handled in conventions (`docs/conventions/documentation.md`) rather than as a shape.
- **Just README + ADR** (drop plans and runbooks) — rejected. Plans solve the "where do I track work?" question; runbooks solve "how do I do X operationally?". Both are load-bearing.
- **Ten shapes (add: tutorial, FAQ, glossary, roadmap, incident-log, changelog-entry...)** — rejected. Proliferation makes "which shape is this?" its own decision burden.

## References

- [MADR (Markdown ADR)](https://adr.github.io/madr/)
- [Diataxis framework](https://diataxis.fr/) — influenced the five-shape thinking; janus picks a smaller set.
- `/home/skip/claude-plugins/research-v2/01-community-survey.md` — doc-shape drift across 35+ public repos.
