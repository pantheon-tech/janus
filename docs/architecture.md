---
title: janus — Architecture
type: reference
last_reviewed: 2026-04-24
owners: [@skipnz]
---

# janus — Architecture

janus is a repository of conventions, templates, and project-level
architectural decisions. It has no runtime. It is consumed in two modes:

1. **Read** — humans and agents read `docs/conventions/` (and `docs/adr/` for janus-specific architectural decisions) to understand the canonical choices.
2. **Scaffold** — `scripts/scaffold.sh` reads `templates/` and renders a new project directory.

## Component overview

```
┌─────────────────────────────────────────────────────────┐
│                        janus                            │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐  │
│  │  docs/adr/   │   │ docs/        │   │  templates/ │  │
│  │              │   │ conventions/ │   │             │  │
│  │  Decisions   │──▶│  Reference   │──▶│  Scaffolds  │  │
│  │  (numbered)  │   │  (chapters)  │   │  (archetype)│  │
│  └──────────────┘   └──────────────┘   └──────┬──────┘  │
│                                                │         │
│                                       ┌────────▼──────┐  │
│                                       │ scaffold.sh   │  │
│                                       └────────┬──────┘  │
└────────────────────────────────────────────────┼─────────┘
                                                 │
                                                 ▼
                                      ~/git/<new-project>/
```

## Archetypes

`templates/` contains one directory per archetype plus `_shared/`:

| Archetype | Purpose |
|---|---|
| `_shared/` | Files common to all archetypes (biome, tsconfig base, editorconfig, gitignore, docs templates, workflows). |
| `backend-functions/` | Azure Functions v4 (Node 20) — sparse APIs, webhooks, event handlers. |
| `backend-container-app/` | Container App — long-running service, WebSockets, stateful. |
| `frontend-vite-react/` | Vite + React + TypeScript + MSAL → deployed to Static Web Apps. |
| `generic-ts/` | Generic TypeScript library/CLI — no Azure assumption, picked when the others don't fit. |
| `types-package/` | Pure-types package published to GitHub Packages. |
| `mcp-server/` | Stdio MCP server. |
| `monorepo-root/` | pnpm workspace orchestrator (references other archetypes as packages). |

## Evolution

- **Conventions** in `docs/conventions/` evolve with the kit; updates ship as part of janus releases.
- **ADRs are append-only** when used. Accepted ADRs are never rewritten; supersede via a new ADR.
- **Template versions** are tagged (`v1.x.y`). Derived projects record which version they were scaffolded from in their own `docs/adr/0001-stack-choices.md`.

## Distribution

- Local: `/home/skip/janus/` cloned once.
- Remote: `github.com/pantheon-tech/janus`.
- Consumed by: `scripts/scaffold.sh` invoked manually; future Claude Code skill may wrap it.
