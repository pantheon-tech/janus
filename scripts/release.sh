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
