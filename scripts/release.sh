#!/usr/bin/env bash
# Janus release helper — interactive release workflow
# Usage: ./scripts/release.sh
# Validates git state, prompts for version, updates package.json and CHANGELOG,
# creates annotated tag, pushes to remote.
#
# Note: This script is for janus kit itself. Derived projects use release-please
# automation (see docs/conventions/versioning.md).

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
sed -i.bak "s|\"version\": \"[^\"]*\"|\"version\": \"$NEW_VERSION\"|" package.json
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

tmpfile=$(mktemp)
trap "rm -f $tmpfile" EXIT

if grep -q "^## \[Unreleased\]" CHANGELOG.md; then
  # Insert after Unreleased section header
  awk -v entry="$CHANGELOG_ENTRY" '
    /^## \[Unreleased\]/ {
      print; print entry; next
    }
    { print }
  ' CHANGELOG.md > "$tmpfile"
else
  # Prepend to file
  {
    echo "$CHANGELOG_ENTRY"
    cat CHANGELOG.md
  } > "$tmpfile"
fi

mv "$tmpfile" CHANGELOG.md

# ─── Commit and tag ─────────────────────────────────────────────────────
echo "Creating git tag..."
git add package.json CHANGELOG.md
git commit -m "chore(release): janus v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release janus $NEW_VERSION"

# ─── Push ────────────────────────────────────────────────────────────────
echo "Pushing to remote..."
git push origin main
git push origin "v$NEW_VERSION"

# ─── Verify push succeeded ──────────────────────────────────────────────
if git rev-parse "v$NEW_VERSION" >/dev/null 2>&1; then
  echo "[OK] Tag verified in local repository"
else
  echo "Warning: Tag not found after push"
fi

echo
echo "[OK] Released janus v$NEW_VERSION"
echo "[OK] Tag: v$NEW_VERSION"
echo "[OK] GitHub Release will be created automatically"
