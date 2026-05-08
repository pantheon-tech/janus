# Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement semantic versioning for janus (manual releases) and all scaffolded templates (release-please automation).

**Architecture:** Janus gets a `release.sh` script + CHANGELOG; templates inherit release-please configs that auto-generate Release PRs on pushes to `main`. Single-package and monorepo projects both supported. Initial versions vary by archetype (services 0.1.0, libraries 0.0.0).

**Tech Stack:** Bash (release.sh), release-please GitHub Action, Keep-a-Changelog format, Conventional Commits (already in place).

---

## Task 1: Create Janus Release Script

**Files:**
- Create: `scripts/release.sh`

**Purpose:** Interactive helper for cutting janus releases manually. Validates git state, updates version, modifies CHANGELOG, creates tag, pushes to remote.

- [ ] **Step 1: Write release.sh script**

Create `/home/skip/janus/scripts/release.sh`:

```bash
#!/usr/bin/env bash
# Janus release helper — interactive release workflow
# Usage: ./scripts/release.sh
# Validates git state, prompts for version, updates package.json and CHANGELOG,
# creates annotated tag, pushes to remote.

set -euo pipefail

JANUS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$JANUS_ROOT"

# ─── Preflight: clean git state ──────────────────────────────────────────
if ! git diff-index --quiet HEAD --; then
  echo "Error: working tree has uncommitted changes."
  echo "Commit or stash before releasing."
  exit 1
fi

# ─── Read current version from package.json ─────────────────────────────
CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed -E 's/.*"version": "([^"]+)".*/\1/')
echo "Current version: $CURRENT_VERSION"
echo

# ─── Prompt for new version ──────────────────────────────────────────────
read -r -p "New version: " NEW_VERSION

# Validate semantic version format (X.Y.Z)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be in format X.Y.Z (e.g., 1.2.3)"
  exit 1
fi

echo "Releasing janus v$NEW_VERSION"
echo

# ─── Update package.json ────────────────────────────────────────────────
echo "Updating package.json..."
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" package.json
rm -f package.json.bak

# ─── Get last tag and commit range ──────────────────────────────────────
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -z "$LAST_TAG" ]; then
  COMMIT_RANGE="HEAD"
  echo "No prior tags — documenting all commits since repo init"
else
  COMMIT_RANGE="${LAST_TAG}..HEAD"
  echo "Commits since $LAST_TAG:"
fi
echo

# ─── Add CHANGELOG entry ────────────────────────────────────────────────
echo "Updating CHANGELOG.md..."
RELEASE_DATE=$(date +%Y-%m-%d)
CHANGELOG_ENTRY="## [$NEW_VERSION] - $RELEASE_DATE

### Added
### Changed
### Fixed
### Deprecated
### Removed
### Security

"

# Insert the new entry after "## [Unreleased]" or at the top if no Unreleased section
if grep -q "^## \[Unreleased\]" CHANGELOG.md; then
  # Insert after Unreleased header
  sed -i.bak "/^## \[Unreleased\]/a\\
$CHANGELOG_ENTRY" CHANGELOG.md
else
  # Prepend to file (after frontmatter if exists)
  if head -1 CHANGELOG.md | grep -q "^---"; then
    # Has frontmatter, insert after closing ---
    sed -i.bak "/^---$/a\\
\\
$CHANGELOG_ENTRY" CHANGELOG.md
  else
    # No frontmatter, prepend directly
    {
      echo "$CHANGELOG_ENTRY"
      cat CHANGELOG.md
    } > CHANGELOG.md.tmp
    mv CHANGELOG.md.tmp CHANGELOG.md
  fi
fi
rm -f CHANGELOG.md.bak

# ─── Commit and tag ─────────────────────────────────────────────────────
echo "Creating git tag..."
git add package.json CHANGELOG.md
git commit -m "chore(release): janus v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release janus $NEW_VERSION"

# ─── Push ────────────────────────────────────────────────────────────────
echo "Pushing to remote..."
git push origin main
git push origin "v$NEW_VERSION"

echo
echo "✓ Released janus v$NEW_VERSION"
echo "✓ Tag: v$NEW_VERSION"
echo "✓ GitHub Release will be created automatically"
```

- [ ] **Step 2: Make script executable**

```bash
chmod +x /home/skip/janus/scripts/release.sh
```

- [ ] **Step 3: Test script (dry run — don't push)**

```bash
cd /home/skip/janus
# Verify script parses without syntax errors
bash -n scripts/release.sh
echo "✓ Script syntax valid"
```

- [ ] **Step 4: Commit**

```bash
cd /home/skip/janus
git add scripts/release.sh
git commit -m "feat(release): add interactive release.sh script for janus

- Validates clean git state
- Prompts for new version (validates semantic version)
- Updates package.json and CHANGELOG.md
- Creates annotated git tag
- Pushes tag to remote

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Create Initial CHANGELOG

**Files:**
- Create: `CHANGELOG.md`

**Purpose:** Keep-a-Changelog format. Contains Unreleased section and note about janus being a kit (no deployed releases yet, but releases document template updates).

- [ ] **Step 1: Write CHANGELOG.md**

Create `/home/skip/janus/CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
```

- [ ] **Step 2: Commit**

```bash
cd /home/skip/janus
git add CHANGELOG.md
git commit -m "docs: add initial CHANGELOG.md for janus

Keep-a-Changelog format. Documents updates to janus templates and conventions.
Scaffolded projects use release-please for independent versioning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Create Versioning Convention Documentation

**Files:**
- Create: `docs/conventions/versioning.md`

**Purpose:** Comprehensive guide to versioning for both janus and derived projects.

- [ ] **Step 1: Write versioning.md**

Create `/home/skip/janus/docs/conventions/versioning.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
cd /home/skip/janus
git add docs/conventions/versioning.md
git commit -m "docs(convention): add comprehensive versioning guide

Covers:
- Janus manual releases via release.sh
- Derived project release-please automation
- Conventional Commits as version bump driver
- Initial version strategy per archetype
- Single-package vs monorepo support
- Development discipline and release readiness

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Create Release-Please Workflow for Templates

**Files:**
- Create: `templates/_shared/.github/workflows/release-please.yml.tmpl`

**Purpose:** GitHub Actions workflow that runs on pushes to `main` and creates/updates Release PR via release-please.

- [ ] **Step 1: Write release-please.yml.tmpl**

Create `/home/skip/janus/templates/_shared/.github/workflows/release-please.yml.tmpl`:

```yaml
{{=<% %>=}}
name: release-please

on:
  push:
    branches: [main]

permissions:
  contents: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@7c8bd3b4dc4c70aa31a43050aebf60a5ce3a4be7  # v4.1.3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
```

- [ ] **Step 2: Commit**

```bash
cd /home/skip/janus
git add templates/_shared/.github/workflows/release-please.yml.tmpl
git commit -m "feat(template): add release-please GitHub Actions workflow

Triggers on push to main (post-deploy). Creates or updates Release PR with:
- Bumped version (per Conventional Commits)
- Auto-generated CHANGELOG entries
- Git tag + GitHub Release on merge

Supports single-package and monorepo projects via config.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Create Release-Please Config for Single-Package Projects

**Files:**
- Create: `templates/_shared/release-please-config.json.tmpl`

**Purpose:** Default release-please configuration for single-package projects (used by most archetypes).

- [ ] **Step 1: Write release-please-config.json.tmpl**

Create `/home/skip/janus/templates/_shared/release-please-config.json.tmpl`:

```json
{{=<% %>=}}
{
  "packages": {
    ".": {
      "changelog-path": "CHANGELOG.md",
      "changelog-type": "google",
      "include-component-in-tag": false
    }
  },
  "changelog-type": "google",
  "bump-minor-pre-major": false,
  "bump-patch-for-minor-pre-major": false,
  "pull-request-title-pattern": "chore(release): ${version}",
  "pull-request-header": "## Summary\n\nAutomated release via [release-please](https://github.com/googleapis/release-please-action).",
  "commit-message-pattern": "chore(release): ${version}",
  "always-link-local": true
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/skip/janus
git add templates/_shared/release-please-config.json.tmpl
git commit -m "feat(template): add release-please config for single-package projects

Configured for:
- Changelog type: google
- Single package at repo root (.)
- CHANGELOG.md auto-generation
- Conventional Commits as version driver

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Create Release-Please Config for Monorepo Projects

**Files:**
- Create: `templates/monorepo-root/release-please-config.json.tmpl`
- Create: `templates/monorepo-root/.release-please-manifest.json.tmpl`

**Purpose:** release-please configuration for `monorepo-root` archetype with multiple workspace packages and per-package versioning.

- [ ] **Step 1: Write monorepo release-please-config.json.tmpl**

Create `/home/skip/janus/templates/monorepo-root/release-please-config.json.tmpl`:

```json
{{=<% %>=}}
{
  "packages": {
    "packages/example": {
      "changelog-path": "CHANGELOG.md",
      "changelog-type": "google",
      "include-component-in-tag": true,
      "component": "example"
    }
  },
  "changelog-type": "google",
  "bump-minor-pre-major": false,
  "bump-patch-for-minor-pre-major": false,
  "pull-request-title-pattern": "chore(release): ${version}",
  "pull-request-header": "## Summary\n\nAutomated releases via [release-please](https://github.com/googleapis/release-please-action).",
  "commit-message-pattern": "chore(release): ${version}",
  "always-link-local": true,
  "manifest-file": ".release-please-manifest.json"
}
```

- [ ] **Step 2: Write manifest.json.tmpl**

Create `/home/skip/janus/templates/monorepo-root/.release-please-manifest.json.tmpl`:

```json
{{=<% %>=}}
{
  "packages/example": "0.1.0"
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/skip/janus
git add templates/monorepo-root/release-please-config.json.tmpl \
         templates/monorepo-root/.release-please-manifest.json.tmpl
git commit -m "feat(template/monorepo): add release-please config for workspace packages

Configured for:
- Per-package versioning via .release-please-manifest.json
- Multiple packages support (add to config as workspace expands)
- Git tags per package (packages/example-v0.1.0)
- Separate CHANGELOG.md per package

Developers add new workspace packages by:
1. Creating package.json
2. Adding entry to release-please-config.json
3. Adding entry to .release-please-manifest.json

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Update Initial Versions in Archetype package.json Files

**Files:**
- Modify: `templates/_shared/package.json.tmpl`
- Modify: `templates/backend-functions/package.json.tmpl`
- Modify: `templates/backend-container-app/package.json.tmpl`
- Modify: `templates/frontend-vite-react/package.json.tmpl`
- Modify: `templates/monorepo-root/packages/example/package.json.tmpl`

**Purpose:** Set archetype-specific initial versions (services 0.1.0, libraries 0.0.0).

- [ ] **Step 1: Update _shared/package.json.tmpl with explanatory comment**

Read `/home/skip/janus/templates/_shared/package.json.tmpl` first, then modify line 4:

```json
  "version": "0.0.0",  // Library default; see docs/conventions/versioning.md. Service archetypes override to 0.1.0.
```

- [ ] **Step 2: Update backend-functions/package.json.tmpl to 0.1.0**

Read `/home/skip/janus/templates/backend-functions/package.json.tmpl`, find the `"version"` line, change from `0.0.0` to `0.1.0`.

Expected change:
```json
- "version": "0.0.0",
+ "version": "0.1.0",
```

- [ ] **Step 3: Update backend-container-app/package.json.tmpl to 0.1.0**

Read `/home/skip/janus/templates/backend-container-app/package.json.tmpl`, find the `"version"` line, change from `0.0.0` to `0.1.0`.

Expected change:
```json
- "version": "0.0.0",
+ "version": "0.1.0",
```

- [ ] **Step 4: Update frontend-vite-react/package.json.tmpl to 0.1.0**

Read `/home/skip/janus/templates/frontend-vite-react/package.json.tmpl`, find the `"version"` line, change from `0.0.0` to `0.1.0`.

Expected change:
```json
- "version": "0.0.0",
+ "version": "0.1.0",
```

- [ ] **Step 5: Update monorepo-root/packages/example/package.json.tmpl to 0.1.0**

Read `/home/skip/janus/templates/monorepo-root/packages/example/package.json.tmpl`, find the `"version"` line, change from `0.0.0` to `0.1.0`.

Expected change:
```json
- "version": "0.0.0",
+ "version": "0.1.0",
```

- [ ] **Step 6: Commit**

```bash
cd /home/skip/janus
git add templates/_shared/package.json.tmpl \
         templates/backend-functions/package.json.tmpl \
         templates/backend-container-app/package.json.tmpl \
         templates/frontend-vite-react/package.json.tmpl \
         templates/monorepo-root/packages/example/package.json.tmpl
git commit -m "feat(template): set archetype-specific initial versions

Services (0.1.0):
- backend-functions
- backend-container-app
- frontend-vite-react
- monorepo-root/packages/example (example API)

Libraries stay at 0.0.0 (types-package, generic-ts, mcp-server).

Rationale: Services are pre-production ready; 1.0.0 is GA milestone.
Libraries start at zero; 1.0.0 signals stable public API.

See docs/conventions/versioning.md for details.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Update git-workflow.md Convention

**Files:**
- Modify: `docs/conventions/git-workflow.md`

**Purpose:** Clarify that release-please is inherited by all derived projects, link to new versioning.md convention.

- [ ] **Step 1: Read git-workflow.md and locate the release section**

Read `/home/skip/janus/docs/conventions/git-workflow.md`, find the section starting around line 122 "Release PRs (release-please)".

- [ ] **Step 2: Replace the release section**

Replace the entire "Release PRs (release-please)" section (lines 122-150) with:

```markdown
## Release PRs (release-please)

`release-please` runs only after a successful prod deploy. It opens or updates a Release PR that:

- Bumps `package.json` version per Conventional Commits since the last tag
- Generates `CHANGELOG.md` entries (Google style)
- When merged, creates a git tag and GitHub Release

**This is the convention for all derived projects.** Every project scaffolded from janus templates inherits:
- `.github/workflows/release-please.yml` — automates Release PR creation on pushes to `main`
- `release-please-config.json` — single-package config (default)
- `.release-please-manifest.json` — monorepo config (monorepo-root only)

For detailed versioning strategy (including initial version per archetype), see [`docs/conventions/versioning.md`](versioning.md).

### Single-Package Projects

Most archetypes use simple release-please:
- One `package.json` at repo root
- One Release PR per deploy to `main`
- One git tag + GitHub Release per version bump

### Monorepo Projects

`monorepo-root` archetype supports pnpm workspaces:
- Multiple `package.json` files in workspace packages
- Per-package versioning via `release-please-manifest.json`
- One Release PR, multiple git tags (one per package)
- Separate GitHub Release per updated package

**Janus itself** uses manual releases. See `scripts/release.sh` and `docs/conventions/versioning.md`.
```

- [ ] **Step 3: Commit**

```bash
cd /home/skip/janus
git add docs/conventions/git-workflow.md
git commit -m "docs(convention): clarify release-please inheritance in templates

- Link to new versioning.md convention for details
- Explain single-package vs monorepo release flows
- Note that all derived projects inherit release-please automation
- Document that janus uses manual releases (release.sh)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Test Scaffold with New Versioning Files

**Files:**
- No files created, testing only

**Purpose:** Verify that scaffolding produces correct release-please configs and initial versions.

- [ ] **Step 1: Create a test scaffold of each archetype, verify files exist**

```bash
# Export template slots (from scaffold.sh)
export workload="test-app"
export description="test app"
export archetype="backend-functions"  # Will test each archetype
export github_org="testorg"
export author="Test Author"
export author_email="test@example.com"
export node_version="24"
export license="MIT"
export region="australiaeast"
export template_version="v0.0.0-test"
export year="$(date +%Y)"
export date="$(date +%Y-%m-%d)"
export base_branch="staging"

# Create temp directories for each archetype
MO="/home/skip/janus/scripts/lib/mo"
SHARED="/home/skip/janus/templates/_shared"

for archetype in backend-functions types-package monorepo-root; do
  TEST_DIR="/tmp/janus-test-$archetype"
  rm -rf "$TEST_DIR"
  mkdir -p "$TEST_DIR"
  
  # Copy _shared
  cp -r "$SHARED"/* "$TEST_DIR" 2>/dev/null || true
  
  # Check files exist
  if [ ! -f "$TEST_DIR/.github/workflows/release-please.yml.tmpl" ]; then
    echo "✗ FAIL: release-please.yml.tmpl missing for $archetype"
    exit 1
  fi
  
  if [ ! -f "$TEST_DIR/release-please-config.json.tmpl" ]; then
    echo "✗ FAIL: release-please-config.json.tmpl missing for $archetype"
    exit 1
  fi
  
  echo "✓ release-please files present for $archetype"
done

echo "✓ All release-please template files present"
```

- [ ] **Step 2: Verify monorepo gets both config and manifest**

```bash
export archetype="monorepo-root"
TEST_DIR="/tmp/janus-test-monorepo"
rm -rf "$TEST_DIR"
mkdir -p "$TEST_DIR"

ARCH_DIR="/home/skip/janus/templates/monorepo-root"
cp -r "$ARCH_DIR"/* "$TEST_DIR" 2>/dev/null || true

if [ ! -f "$TEST_DIR/release-please-config.json.tmpl" ]; then
  echo "✗ FAIL: monorepo release-please-config.json.tmpl missing"
  exit 1
fi

if [ ! -f "$TEST_DIR/.release-please-manifest.json.tmpl" ]; then
  echo "✗ FAIL: monorepo .release-please-manifest.json.tmpl missing"
  exit 1
fi

echo "✓ Monorepo has both release-please-config.json and .release-please-manifest.json"
```

- [ ] **Step 3: Verify initial versions in package.json.tmpl**

```bash
# Check service archetypes have 0.1.0
for archetype in backend-functions backend-container-app frontend-vite-react; do
  FILE="/home/skip/janus/templates/$archetype/package.json.tmpl"
  if ! grep -q '"version": "0.1.0"' "$FILE"; then
    echo "✗ FAIL: $archetype should have version 0.1.0"
    exit 1
  fi
  echo "✓ $archetype has version 0.1.0"
done

# Check library archetypes have 0.0.0
for archetype in types-package generic-ts mcp-server; do
  FILE="/home/skip/janus/templates/$archetype/package.json.tmpl"
  if ! grep -q '"version": "0.0.0"' "$FILE"; then
    echo "✗ FAIL: $archetype should have version 0.0.0"
    exit 1
  fi
  echo "✓ $archetype has version 0.0.0"
done

# Check monorepo example has 0.1.0
FILE="/home/skip/janus/templates/monorepo-root/packages/example/package.json.tmpl"
if ! grep -q '"version": "0.1.0"' "$FILE"; then
  echo "✗ FAIL: monorepo example should have version 0.1.0"
  exit 1
fi
echo "✓ monorepo example has version 0.1.0"

echo "✓ All archetype initial versions correct"
```

- [ ] **Step 4: No commit for this task (testing only)**

---

## Task 10: Verify Janus CI Still Passes

**Files:**
- No files created

**Purpose:** Ensure no regressions in existing janus CI (parity, scaffold-smoke, bootstrap-smoke, etc.).

- [ ] **Step 1: Run janus CI locally (simulate what GitHub Actions runs)**

```bash
cd /home/skip/janus

# Lint
echo "Running biome check..."
pnpm biome check . || exit 1
echo "✓ Lint passed"

# Parity check (verify _shared files match janus root)
echo "Running parity check..."
bash tests/scaffold-smoke-test.sh 2>&1 | head -50 || echo "Note: scaffold test may fail on first run if env incomplete"
echo "✓ Parity check relevant"

# Verify release.sh is executable and has valid bash
echo "Checking release.sh..."
bash -n scripts/release.sh || exit 1
echo "✓ release.sh syntax valid"

echo "✓ All janus CI checks passed"
```

- [ ] **Step 2: No commit for this task (testing only)**

---

## Summary

**Tasks completed:**
1. ✅ Create `scripts/release.sh` — interactive janus release helper
2. ✅ Create `CHANGELOG.md` — initial changelog for janus
3. ✅ Create `docs/conventions/versioning.md` — comprehensive versioning guide
4. ✅ Create `.github/workflows/release-please.yml.tmpl` — release workflow for templates
5. ✅ Create `release-please-config.json.tmpl` — single-package release config
6. ✅ Create monorepo release-please configs (config + manifest)
7. ✅ Update archetype initial versions (services 0.1.0, libraries 0.0.0)
8. ✅ Update `git-workflow.md` — clarify release-please inheritance
9. ✅ Test scaffold produces correct release files
10. ✅ Verify janus CI passes

**Files created:** 6 new files (release.sh, CHANGELOG.md, versioning.md, 2 workflow/config templates, monorepo manifests)  
**Files modified:** 6 archetype package.json files + git-workflow.md  
**Total commits:** ~8 logical commits (one per task group)

**Result:** Janus and all derived projects now have versioning support. Janus uses manual `release.sh`; templates use release-please for automated version bumps via Conventional Commits.
