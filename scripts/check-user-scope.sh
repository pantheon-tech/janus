#!/usr/bin/env bash
# check-user-scope.sh — verify ~/.claude/ has the janus user-scope kit.
#
# Exit codes:
#   0 = all expected pieces present
#   1 = something missing or malformed
#
# Used by:
#   - `janus check` (CLI command)
#   - scripts/scaffold.sh (warning at scaffold time if user-scope absent)
set -euo pipefail

TARGET_HOME="${HOME}"
QUIET=false
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET_HOME="$2"; shift ;;
    --quiet|-q) QUIET=true ;;
    --help|-h) head -12 "$0" | tail -10; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

TARGET_DIR="${TARGET_HOME}/.claude"
ISSUES=0

note()  { "$QUIET" || echo "$@"; }
fail()  { "$QUIET" || echo "  ✗ $@"; ISSUES=$((ISSUES + 1)); }
ok()    { "$QUIET" || echo "  ✓ $@"; }

note "Checking ${TARGET_DIR}..."

# settings.json present + parses
if [ ! -f "${TARGET_DIR}/settings.json" ]; then
  fail "settings.json missing"
elif ! jq empty "${TARGET_DIR}/settings.json" >/dev/null 2>&1; then
  fail "settings.json is invalid JSON"
else
  ok "settings.json parses"
  # Spot-check expected plugins are enabled
  for plugin in superpowers context7 typescript-lsp; do
    if jq -e ".enabledPlugins[\"${plugin}@claude-plugins-official\"] == true" \
        "${TARGET_DIR}/settings.json" >/dev/null 2>&1; then
      ok "plugin enabled: ${plugin}"
    else
      fail "plugin not enabled: ${plugin} (run: janus bootstrap)"
    fi
  done
fi

# Hooks
for h in stop-memory-check.sh ts-check-on-edit.sh; do
  if [ ! -x "${TARGET_DIR}/hooks/${h}" ]; then
    fail "hook missing or not executable: hooks/${h}"
  else
    ok "hook present: ${h}"
  fi
done

# Skills (just check the dirs exist)
for s in bugfix sprint spawn-fleet activity-report workflow-fix new-project; do
  if [ ! -f "${TARGET_DIR}/skills/${s}/SKILL.md" ]; then
    fail "skill missing: ${s}"
  else
    ok "skill present: ${s}"
  fi
done

# Rules
for r in fetch-before-work github-pagination issue-on-discovery tool-fallbacks trust-user-diagnosis worktree-safety; do
  if [ ! -f "${TARGET_DIR}/rules/${r}.md" ]; then
    fail "rule missing: ${r}"
  else
    ok "rule present: ${r}"
  fi
done

# CLAUDE.md
if [ ! -f "${TARGET_DIR}/CLAUDE.md" ]; then
  fail "CLAUDE.md missing"
else
  ok "CLAUDE.md present"
fi

note ""
if [ "$ISSUES" -eq 0 ]; then
  note "User-scope OK."
  exit 0
else
  note "${ISSUES} issue(s) found. Run: npx @pantheon-tech/janus bootstrap"
  exit 1
fi
