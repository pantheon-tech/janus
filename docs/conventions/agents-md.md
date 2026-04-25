---
title: AGENTS.md Primary
type: reference
last_reviewed: 2026-04-24
owners: [@skipnz]
---

# AGENTS.md Primary

`AGENTS.md` is the primary agent-context file in every janus-derived project. `CLAUDE.md` is a thin pointer.

## Why

`AGENTS.md` is the cross-tool standard for portable agent context. Recognised natively by Claude Code, Codex, Cursor, Amp, Copilot, Gemini CLI, Aider, OpenHands, Jules. Stewarded under the Linux Foundation Agentic AI Foundation alongside MCP and Agent Skills.

Using `AGENTS.md` as primary means the same project context steers any of these tools. Putting Claude-specific directives in `CLAUDE.md` keeps Claude-only behaviour out of the portable file.

## AGENTS.md shape

Seven sections. Strict.

```markdown
# <project-name>

## Overview
<1-2 sentences describing the project>

## Tech Stack
<table>

## Commands
<bash block with canonical commands>

## Structure
<file tree or bullet list>

## Critical Context
<≤10 terse bullets — non-obvious invariants>

## Design Decisions
<links to docs/adr/>

## Known Issues
<dated list>

---
*Last reviewed: YYYY-MM-DD*
```

## Length

See the canonical length-cap table in
[`./docs-shapes.md`](./docs-shapes.md#length-caps). Above target: split content
into `docs/adr/`, `docs/runbooks/`, or per-package files. Above hard max: an
ADR is required for the exception.

## CLAUDE.md shape

```markdown
@AGENTS.md

## Claude-specific
- <Claude-only directives>
- <e.g. skill hints, model preferences, compaction directives>
```

The `@AGENTS.md` line is Claude Code's import syntax. Other tools read `AGENTS.md` directly.

## Per-package (monorepo)

Each package has its own `AGENTS.md` in its directory. Claude Code loads nested `AGENTS.md` files on demand when working in that subtree. The package-level file is a **delta** — it does not duplicate root content.

## Emphasis

Reserve uppercase emphasis tokens (the kind agents heuristically over-weight)
for genuine data-loss gates. Cap at **1–3 per file**. Use markdown structure
(headings, tables, bold) for ordinary emphasis. Aggressive emphasis language
overtriggers current Claude models.

## Rot prevention

- Frontmatter `last_reviewed: YYYY-MM-DD` mandatory.
- Re-review every 6 months minimum (`docs-staleness.yml` workflow opens an issue if exceeded).
- "Known Issues" section is dated entries; remove resolved entries during review.
