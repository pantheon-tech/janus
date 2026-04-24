---
title: janus — Architecture
type: reference
last_reviewed: 2026-04-24
---

# janus — Architecture

janus is a repository of decisions, conventions, and templates. It has no runtime. It is consumed in two modes:

1. **Read** — humans and agents read `docs/adr/` and `docs/conventions/` to understand the canonical choices.
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
| `types-package/` | Pure-types package published to GitHub Packages. |
| `mcp-server/` | Stdio MCP server. |
| `monorepo-root/` | pnpm workspace orchestrator (references other archetypes as packages). |

## Evolution

- **ADRs are append-only.** Accepted ADRs are never rewritten; changes go into a new ADR that supersedes the old one.
- **Conventions in `docs/conventions/` can be updated** but should cite the ADR that authorises the change.
- **Template versions** are tagged (`v1.x.y`). Derived projects record which version they were scaffolded from in their own `docs/adr/0001-stack-choices.md`.

## Distribution

- Local: `/home/skip/janus/` cloned once.
- Remote: `github.com/skipnz/janus`.
- Consumed by: `scripts/scaffold.sh` invoked manually; future Claude Code skill may wrap it.
