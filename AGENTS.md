---
title: janus
type: agents
last_reviewed: 2026-04-25
owners: [@skipnz]
---

# janus

## Overview

Portable project starter kit for TypeScript + Azure solo-dev work. Encodes conventions so new projects inherit a baseline instead of re-evolving decisions.

## Tech Stack

| Aspect | Value |
|---|---|
| Package manager | pnpm |
| Runtime | Node 24 |
| Lint + format | Biome 2 |
| Git hooks | lefthook (gitleaks + biome) |
| Commits | Conventional Commits via commitlint |

This repo has no runtime — it ships docs, conventions, and template files.

## Commands

```bash
pnpm install              # dev tooling (biome, commitlint, lefthook)
pnpm lint                 # biome check
pnpm format               # biome format --write
pnpm check                # biome check --write
./scripts/scaffold.sh     # generate a new project from templates/
./scripts/version.sh      # print janus version
```

## Structure

```
janus/
├── docs/
│   ├── conventions/      — base rules every derived project inherits
│   ├── adr/              — architectural decisions specific to janus (rare)
│   ├── plans/            — implementation plans for janus itself
│   └── runbooks/         — ops procedures
├── templates/
│   ├── _shared/          — files common to all archetypes
│   ├── backend-functions/         — Azure Functions v4
│   ├── backend-container-app/     — long-running service
│   ├── frontend-vite-react/       — Vite + React + MSAL + SWA
│   ├── generic-ts/                — minimal TS package (no infra)
│   ├── types-package/             — shared wire types
│   ├── mcp-server/                — stdio MCP server
│   └── monorepo-root/             — pnpm workspace orchestrator
└── scripts/              — scaffold + version helpers
```

## Critical Context

- Conventions live in `docs/conventions/`, not in ADRs. ADRs are for janus-specific architectural decisions only.
- Templates use `<%snake_case%>` placeholders for slot substitution at scaffold time (Mustache custom delimiters; `.tmpl` files open with `{{=<% %>=}}` so GitHub Actions `${{ }}` expressions pass through untouched).
- `_shared/` is overlaid first; per-archetype files take precedence on collision.
- Two-branch model: feature → `staging` → `main`. See `docs/conventions/git-workflow.md`.

## Design Decisions

See `docs/adr/` (currently empty — base conventions in `docs/conventions/`).

## Known Issues

- (2026-04-24) `_shared/.claude/hooks/` directory exists but contains no hook scripts yet.
