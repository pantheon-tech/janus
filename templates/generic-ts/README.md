# generic-ts archetype

Minimal TypeScript single-package — libraries, CLIs, scripts, experiments, internal tools.

## When to pick this

- It doesn't deploy to Azure (or doesn't deploy at all).
- It's a library, CLI, or script — no infrastructure.
- It's an experiment that hasn't earned a more specific archetype yet.
- It's an internal-only utility.

## What it ships

- TypeScript strict + Vitest + Biome v2 + lefthook + Conventional Commits
- CI workflow (lint/typecheck/test/build, no deploy)
- `release.yml` (release-please) — opt-in
- AGENTS.md, CLAUDE.md, README, LICENSE, CHANGELOG
- No `infra/` directory
- No `deploy.yml` workflow
- No Azure / cloud-specific config

## Status

**Ready.** Scaffolded projects install, typecheck, lint, test, and build out of the box.
The archetype's job is to opt OUT of the cloud/deploy bits the other archetypes opt in to,
and add `tsx` (dev) + `tsup` (build) on top of the shared base.

## Structure

```
<package>/
├── src/
│   └── index.ts
├── tests/
│   └── index.test.ts
├── package.json
├── tsconfig.json
├── biome.jsonc
├── vitest.config.ts
├── lefthook.yml
├── commitlint.config.js
├── .editorconfig
├── .gitignore
├── .gitattributes
├── .nvmrc
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── CHANGELOG.md
├── LICENSE
└── .github/
    ├── workflows/
    │   ├── ci.yml
    │   └── release.yml          (opt-in)
    ├── dependabot.yml
    ├── PULL_REQUEST_TEMPLATE.md
    └── ISSUE_TEMPLATE/
```

## Promotion path

If a generic-ts project later grows infrastructure or a deploy target, migrate it to one of the more specific archetypes (backend-functions, backend-container-app, frontend-vite-react). Track the migration with an ADR.
