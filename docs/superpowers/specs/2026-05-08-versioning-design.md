---
title: Versioning Strategy for Janus & Scaffolded Templates
date: 2026-05-08
status: approved
---

# Versioning Strategy for Janus & Scaffolded Templates

## Overview

This design adds semantic versioning to both janus (the template kit) and derived projects scaffolded from janus templates. The approach is **minimal but complete**: janus uses manual releases with a helper script, while all scaffolded projects inherit release-please automation for fully hands-off version bumping based on Conventional Commits.

## Goals

1. **Janus**: Enable reproducible releases with clear changelog, while keeping automation minimal
2. **Derived projects**: Automate version bumps based on Conventional Commits (already enforced via commitlint)
3. **Developer experience**: Release workflows should be clear, with minimal manual steps
4. **Flexibility**: Support both single-package projects and monorepos out of the box

## Architecture

### Janus Versioning (Manual)

**Source of truth**: `package.json` version field (already exists)

**Release process**:
1. Developer runs `./scripts/release.sh`
2. Script prompts for new version (validates semantic version format)
3. Script updates `package.json` with new version
4. Script adds dated section to `CHANGELOG.md` with commit range since last tag
5. Script creates annotated git tag (`v{version}`)
6. Script pushes tag to remote
7. GitHub automatically creates Release from tag (native GitHub feature)

**Files**:
- `package.json` — version source of truth
- `CHANGELOG.md` (Keep-a-Changelog format) — human-readable release notes
- `scripts/release.sh` — interactive release helper

**No GitHub Actions release workflow** — janus is a kit, not a deployed service. Releases are infrequent and manual is appropriate.

**Benefits**:
- Simple, auditable process
- No CI/CD overhead
- Changelog is intentional (not auto-generated)
- Easy to backport fixes to prior versions if needed

---

### Derived Projects: Release-Please Automation

**Principle**: Every scaffolded project inherits release-please configuration. Users follow Conventional Commits (already enforced), and releases are 100% automated.

#### Single-Package Projects

Most archetypes are single-package: `backend-functions`, `backend-container-app`, `frontend-vite-react`, `types-package`, `generic-ts`, `mcp-server`.

**Configuration**:
```json
// release-please-config.json
{
  "packages": {
    ".": {}
  },
  "changelog-type": "google",
  "bump-minor-pre-major": false,
  "bump-patch-for-minor-pre-major": false
}
```

**Workflow**: `.github/workflows/release-please.yml`
- Trigger: push to `main` (after prod deploy)
- Action: release-please creates or updates Release PR
- Release PR contains:
  - Updated `package.json` version (computed from Conventional Commits since last tag)
  - Auto-generated `CHANGELOG.md` entries
  - Commit message: "chore(release): <version>"
- On merge: creates git tag + GitHub Release

**Initial version**: Archetype-dependent
- Services (`backend-functions`, `backend-container-app`, `frontend-vite-react`): `0.1.0`
  - Rationale: pre-production, ready to ship at 1.0.0
- Libraries (`types-package`, `generic-ts`, `mcp-server`): `0.0.0`
  - Rationale: start at zero, bump to 1.0.0 on first real release

#### Monorepo Projects

`monorepo-root` archetype supports pnpm workspaces with per-package versioning.

**Configuration**:
```json
// release-please-config.json
{
  "packages": {
    "packages/api": {},
    "packages/web": {},
    "packages/types": {}
  },
  "changelog-type": "google",
  "bump-minor-pre-major": false,
  "bump-patch-for-minor-pre-major": false
}
```

```json
// .release-please-manifest.json (auto-maintained by release-please)
{
  "packages/api": "0.1.0",
  "packages/web": "0.1.0",
  "packages/types": "0.0.0"
}
```

**Workflow**: Same as single-package, but:
- One Release PR per `main` push
- Updates all packages that changed since last release
- Creates multiple git tags (one per package): `packages/api-v0.1.0`, `packages/web-v0.1.0`, etc.
- Creates one GitHub Release per updated package

**Initial versions**: Each package sets its own based on its archetype (service vs library)

---

## Changes to Janus

### New Files

1. **`scripts/release.sh`** — Interactive release script for janus
   - Validates clean git state
   - Prompts for new version (validates semantic version format)
   - Updates `package.json` version
   - Adds dated entry to `CHANGELOG.md`
   - Creates annotated git tag
   - Pushes tag to remote

2. **`CHANGELOG.md`** — Initial changelog at repo root
   - Keep-a-Changelog format
   - Includes "Unreleased" section
   - First release entry documents all prior work

3. **`docs/conventions/versioning.md`** — Convention documentation
   - Explains janus manual release process
   - Explains derived projects use release-please
   - Conventional Commits as version driver
   - Links to git-workflow.md for promotion gates

### Modified Files

1. **`.github/workflows/janus-ci.yml`** — No changes
   - Existing CI is sufficient; no release automation in janus

---

## Changes to Templates

### New Files in `templates/_shared/`

1. **`.github/workflows/release-please.yml.tmpl`** — GitHub Actions workflow
   - Triggers on push to `main` only
   - Uses release-please action (googleapis/release-please-action)
   - Creates/updates Release PR
   - On merge: creates tags + GitHub Releases
   - No post-release hooks (Approach A: minimal)

2. **`release-please-config.json.tmpl`** — Release-please configuration
   - Single-package default (used by most archetypes)
   - Slot: `<%workload%>` for package name
   - Slots: `<%archetype%>` to detect monorepo variant

### New Files in `templates/monorepo-root/`

1. **`release-please-config.json.tmpl`** — Monorepo-specific config
   - Multiple packages defined
   - Slots: `<%workload%>` references in package paths
   - Inherits `.release-please-manifest.json.tmpl` via overlay

2. **`.release-please-manifest.json.tmpl`** — Per-package version tracking
   - Maps each workspace package to initial version
   - Excluded from single-package archetypes

### Modified Files

1. **`templates/_shared/package.json.tmpl`** — Update default initial version
   - Change from `0.0.0` → stay at `0.0.0` (library default)
   - Comment explaining archetype overrides

2. **Service archetypes' `package.json.tmpl`** (override `_shared` default):
   - `templates/backend-functions/package.json.tmpl` → `0.1.0`
   - `templates/backend-container-app/package.json.tmpl` → `0.1.0`
   - `templates/frontend-vite-react/package.json.tmpl` → `0.1.0`

3. **`templates/monorepo-root/packages/example/package.json.tmpl`** → `0.1.0`
   - Example package in monorepo is a service (API)

4. **`docs/conventions/git-workflow.md`** — Update release section
   - Clarify release-please is inherited by all derived projects
   - Link to new `versioning.md` convention
   - Emphasize Conventional Commits drive version bumps

---

## Release Workflows

### Janus Release (Manual)

```bash
cd /home/skip/janus
./scripts/release.sh

# Prompts:
# > New version [current: 1.0.5]: 1.1.0
# > Created tag v1.1.0
# > Pushed to origin
# > GitHub Release: https://github.com/pantheon-tech/janus/releases/tag/v1.1.0
```

### Derived Project Release (Automatic)

**Single-package project**:
1. Developer commits to `staging`, opens feature PRs
2. Feature PR merged to `staging` → CI runs
3. Release PR approved by humans, merged to `main` → CI runs → prod deploy succeeds
4. release-please detects merge to `main`, analyzes commits since last tag
5. release-please opens Release PR (e.g., "chore(release): 0.1.1")
   - `package.json` version bumped
   - `CHANGELOG.md` updated with commit messages
6. Developer (or auto-merge) merges Release PR
7. release-please creates git tag + GitHub Release
8. **User optionally publishes to npm** (manual step if library)

**Monorepo project**:
- Same flow, but one Release PR updates multiple packages per their changes
- Multiple git tags created per package
- Multiple GitHub Releases created

---

## Version Initialization Strategy

| Archetype | Initial | Rationale |
|---|---|---|
| `backend-functions` | `0.1.0` | Service, pre-production |
| `backend-container-app` | `0.1.0` | Service, pre-production |
| `frontend-vite-react` | `0.1.0` | Service, pre-production |
| `types-package` | `0.0.0` | Library, zero-start |
| `generic-ts` | `0.0.0` | Library, zero-start |
| `mcp-server` | `0.0.0` | Library, zero-start |
| `monorepo-root` | varies per package | Services `0.1.0`, libraries `0.0.0` |

Rationale for split:
- **Services** (`0.1.0`): Already in pre-release / beta state, ready for first customer. 1.0.0 is the stability/GA milestone.
- **Libraries** (`0.0.0`): Start at zero to signal "no stable API yet". 1.0.0 means stable public API.

---

## Conventional Commits as Version Driver

All derived projects enforce Conventional Commits via `commitlint.config.js` (already in `_shared`).

release-please parses commit types to determine version bumps:
- `fix: ...` → patch bump (0.0.1 → 0.0.2)
- `feat: ...` → minor bump (0.0.0 → 0.1.0)
- `BREAKING CHANGE: ...` in body → major bump (0.1.0 → 1.0.0)

This is automatic; developers just follow Conventional Commits (already enforced), and release-please handles the math.

---

## Implementation Scope

**Phase 1 (this design)**:
- Add `scripts/release.sh` and `CHANGELOG.md` to janus
- Add `release-please.yml.tmpl` and `release-please-config.json.tmpl` to `_shared`
- Update archetype `package.json.tmpl` files with correct initial versions
- Add versioning conventions doc
- Update git-workflow.md to reference new conventions

**Not in scope**:
- Post-release hooks (npm publish, Docker push, SWA deploy) — Approach A (minimal)
- Automated janus releases (user runs `release.sh` manually)
- Backport / cherry-pick workflows

---

## Documentation for Developers

### New: `docs/conventions/versioning.md`

Explains:
- How janus versioning works (manual `release.sh`)
- How derived projects use release-please
- Conventional Commits as version driver
- How to cut a release (for each archetype)
- Monorepo release process

### Updated: `docs/conventions/git-workflow.md`

Section on releases clarified to point to new `versioning.md` convention.

### In-template: `CONTRIBUTING.md` or `AGENTS.md` Critical Context

Briefly note:
- "This project uses release-please for automated versioning"
- "Version bumps are automatic based on Conventional Commits"
- "To release: merge to `main` → review Release PR → merge → done"

---

## Files Modified / Created

### Janus Repo
- `scripts/release.sh` (new)
- `CHANGELOG.md` (new)
- `docs/conventions/versioning.md` (new)
- `docs/conventions/git-workflow.md` (updated: clarify release-please)

### Templates (_shared)
- `.github/workflows/release-please.yml.tmpl` (new)
- `release-please-config.json.tmpl` (new)
- `package.json.tmpl` (updated: clarify version field, add comment)

### Archetype Overlays
- `templates/backend-functions/package.json.tmpl` (updated: 0.0.0 → 0.1.0)
- `templates/backend-container-app/package.json.tmpl` (updated: 0.0.0 → 0.1.0)
- `templates/frontend-vite-react/package.json.tmpl` (updated: 0.0.0 → 0.1.0)

### Monorepo Archetype
- `templates/monorepo-root/release-please-config.json.tmpl` (new)
- `templates/monorepo-root/.release-please-manifest.json.tmpl` (new)
- `templates/monorepo-root/packages/example/package.json.tmpl` (updated: 0.0.0 → 0.1.0)

---

## Success Criteria

1. ✅ Janus has a clear, auditable release process via `release.sh`
2. ✅ All scaffolded projects inherit release-please workflows
3. ✅ Single-package and monorepo projects both work
4. ✅ Initial versions are correct per archetype
5. ✅ Release-please creates Release PRs automatically on `main` pushes
6. ✅ Conventional Commits drive version bumps (already enforced)
7. ✅ Developers understand the flow (doc + comments in templates)
8. ✅ Existing janus CI passes with no regressions
