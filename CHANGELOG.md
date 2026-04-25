# Changelog

All notable changes to janus are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Restructured `docs/`**: collapsed ADRs 0001–0006 into `docs/conventions/`. ADRs are now reserved for project-specific architectural decisions; base conventions are not ADRs.
- **Branch model**: switched from main-only to two-branch (`staging` + `main`) with environment-gated deploys.
- **Workflow files**: single-file branch-aware deploy. New: `claude.yml`, `claude-autofix.yml`, `pr-merge-cleanup.yml`, `codeql.yml`, `issue-triage.yml`. All third-party Actions SHA-pinned.
- **Versions pinned to current**: Node 24 LTS, TypeScript 6.0, Biome 2.4, Vitest 4.1, pnpm 10.33, lefthook 2.1, commitlint 20. AVM modules pinned to verified 0.x versions.
- **Conductor pattern removed**. Use superpowers for workflow primitives.
- **Project-provenance references stripped** from convention files.

### Added
- `conventions/git-workflow.md` — two-branch model, integration branches for parallel agent work, promotion gate to prod.
- `conventions/agents-md.md` — AGENTS.md primary, CLAUDE.md pointer.
- `conventions/docs-shapes.md` — five-shapes rule.
- `conventions/secrets.md` — four-layer secret model.
- `conventions/stack.md` — single source of truth for stack choices.

### Removed
- `docs/adr/0001-0006` — content moved to `docs/conventions/`.
- `docs/conventions/documentation.md` — covered by `agents-md.md` + `docs-shapes.md`.
- `templates/_shared/docs/adr/0001-stack-choices.md.tmpl` — derived projects start with empty `adr/` and add as decisions arise.
- `templates/_shared/README.md` — redundant with `templates/README.md`.

## [0.1.0] — 2026-04-24

Initial commit. Skeleton + first-draft ADRs and conventions.
