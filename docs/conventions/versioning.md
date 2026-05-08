---
title: Versioning & Releases
type: reference
last_reviewed: 2026-05-08
owners: []
---

# Versioning & Releases

Two-tier versioning model: **janus itself uses manual semantic versioning**; **derived projects use release-please automation**.

## Janus Releases (Manual)

Janus is a template kit, not a deployed service. Releases are infrequent and intentional.

### Release Process

```bash
./scripts/release.sh
# Prompts for new version (X.Y.Z format)
# Updates package.json + CHANGELOG.md
# Creates annotated git tag
# Pushes to remote
# GitHub automatically creates Release
```

### Versioning

- Follow [Semantic Versioning](https://semver.org/)
- **Major** (1.0.0): Breaking changes to template contracts or conventions
- **Minor** (1.1.0): New archetypes, new features in templates
- **Patch** (1.0.1): Bug fixes, documentation updates

### Changelog

Maintained in `CHANGELOG.md` (Keep-a-Changelog format). Update section headers (`Added`, `Changed`, `Fixed`, etc.) when cutting a release.

---

## Derived Project Releases (Automatic)

All projects scaffolded from janus inherit **release-please automation**. No manual version management.

### How It Works

1. Developer commits code to `staging` branch (feature work)
2. Feature PR merged to `staging` → CI runs → staging environment deploys
3. Release PR created: `staging` → `main` (human-approved gate)
4. Release PR merged to `main` → CI runs → prod environment deploys
5. **After prod deploy succeeds**, release-please detects the merge to `main`
6. release-please opens a **Release PR** containing:
   - Updated `package.json` version (computed from Conventional Commits)
   - Auto-generated `CHANGELOG.md` entries (Google style)
   - Commit message: `chore(release): <version>`
7. Release PR is merged → release-please creates git tag + GitHub Release

### Version Bumps

Release-please analyzes Conventional Commits since the last tag and auto-bumps:

| Commit Type | Bump |
|---|---|
| `fix: ...` | Patch (0.0.1 → 0.0.2) |
| `feat: ...` | Minor (0.0.0 → 0.1.0) |
| `BREAKING CHANGE:` in body | Major (0.1.0 → 1.0.0) |

See [git-workflow.md](git-workflow.md) for Conventional Commits enforcement.

### Initial Versions

Projects start with different versions based on archetype:

| Archetype | Initial | Rationale |
|---|---|---|
| `backend-functions` | `0.1.0` | Service, pre-release |
| `backend-container-app` | `0.1.0` | Service, pre-release |
| `frontend-vite-react` | `0.1.0` | Service, pre-release |
| `types-package` | `0.0.0` | Library, unstable API |
| `generic-ts` | `0.0.0` | Library, unstable API |
| `mcp-server` | `0.0.0` | Library, unstable API |

**Services** (`0.1.0`): Already in beta, first release is 1.0.0 (stable).  
**Libraries** (`0.0.0`): Start at zero, 1.0.0 signals stable public API.

### Monorepo Support

For `monorepo-root` archetype, each workspace package has its own release track.

Release PR structure:
```
chore(release): release packages

- packages/api: 0.2.0
- packages/web: 1.0.5
- packages/types: 0.3.1
```

Git tags created per package:
```
packages/api-v0.2.0
packages/web-v1.0.5
packages/types-v0.3.1
```

Each gets its own GitHub Release. `.release-please-manifest.json` tracks per-package versions.

### Single-Package vs Monorepo

**Single-package** (most archetypes):
- One `package.json` at root
- Simple release-please config
- One version, one tag, one Release

**Monorepo** (`monorepo-root`):
- Multiple `package.json` files in workspace packages
- release-please-config.json lists all packages
- `.release-please-manifest.json` (auto-maintained) maps packages to versions
- One Release PR, multiple tags/Releases

---

## Development & Release Discipline

### Conventional Commits

All derived projects enforce Conventional Commits via `commitlint`:

```
type(scope): subject

body
[footer]
```

**Types**: `feat`, `fix`, `refactor`, `perf`, `docs`, `style`, `test`, `chore`, `ci`

Violations are caught by git hooks (lefthook) before commit.

### Release Readiness

Before pushing to `main` (promotion from `staging`):

1. All tests pass on `staging`
2. CI (lint, typecheck, test, build) is green
3. Feature is production-ready (or behind a feature flag)
4. Product/team has signed off

Release-please happens **after** the prod deploy succeeds. If the prod deploy fails, the Release PR is not created; don't rush to merge it anyway.

### Publishing (Optional)

For **libraries** (`types-package`, `generic-ts`, `mcp-server`), publishing to npm is a **separate manual step**:

```bash
npm publish
# or
pnpm publish
```

This is **not** automated (Approach A: minimal). Teams can add GitHub Actions post-release hooks later if needed.

For **services** (backends, frontends), deployment is separate and handled by your CD pipeline (configured per-project).

---

## Links

- [git-workflow.md](git-workflow.md) — branch strategy, Conventional Commits, promotion gates
- [dependencies.md](dependencies.md) — dependency management
- Janus `scripts/release.sh` — release helper for janus itself
- [googleapis/release-please-action](https://github.com/googleapis/release-please-action) — what powers template releases
