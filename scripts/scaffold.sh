#!/usr/bin/env bash
# janus — scaffold a new project from templates
#
# Usage: ./scripts/scaffold.sh
# Interactive — prompts for the five scaffold variables.
#
# Status: PLACEHOLDER. Real implementation TODO.
# See /home/skip/janus/docs/plans/active/scaffold-implementation.md (when written)
#
# Planned behaviour:
#   1. Prompt: workload slug, archetype, deploy target, environments, conductor?
#   2. Create target directory ~/git/<workload> (or user-specified path)
#   3. Overlay templates/_shared/ first
#   4. Overlay templates/<archetype>/
#   5. If monorepo: also compose chosen apps/packages
#   6. Substitute {{slot}} placeholders in files + filenames
#   7. Rename .tmpl files to drop extension
#   8. Run git init, initial commit "chore: initial scaffold from janus v<version>"
#   9. Print post-checklist:
#      - gh repo create
#      - ./infra/scripts/setup-oidc.sh for each env
#      - Configure branch protection
#      - Run /setup-labels
#      - Fill in .env.local from .env.example

set -euo pipefail

JANUS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JANUS_VERSION="$(grep '"version"' "${JANUS_ROOT}/package.json" | head -1 | awk -F'"' '{print $4}')"

echo "janus scaffold — not yet implemented"
echo ""
echo "This script will eventually:"
echo "  1. Prompt for project details (name, archetype, deploy target, envs)"
echo "  2. Compose templates/_shared + templates/<archetype> into ~/git/<name>"
echo "  3. Substitute {{slot}} placeholders"
echo "  4. git init + initial commit"
echo "  5. Print post-scaffold checklist"
echo ""
echo "janus version: ${JANUS_VERSION}"
echo "Templates available:"
ls -1 "${JANUS_ROOT}/templates/" | grep -v '^_'
