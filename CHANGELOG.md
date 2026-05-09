# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `janus diagnose` subcommand: analyzes an existing repo and writes a retrofit plan
  to `.janus-retrofit.json`. Supports `--archetype`, `--slot`, `--plugin`, `--no-plugin`,
  `--non-interactive`, `--out`.
- `janus retrofit` subcommand: applies a generated plan as a series of commits on
  `janus/retrofit` (or `--branch <name>`). Supports `--dry-run`, `--no-remote-check`.
- Schema validators (`validatePlan`, `validateMarker`) shipped in `dist/retrofit/`.
- 12+ fixture repos under `tests/fixtures/repos/` exercising every analyzer concern.

### Changed
### Fixed
### Deprecated
### Removed
### Security

---

## Context

Janus is a template kit, not a deployed service. Versions mark significant updates
to the kit — scaffolded projects inherit release-please automation (see
[versioning.md](docs/conventions/versioning.md)) and manage their own releases
independently via Conventional Commits.

This file documents changes to janus itself: template updates, new archetypes,
convention changes, or tooling improvements.
