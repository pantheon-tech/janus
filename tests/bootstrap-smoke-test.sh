#!/usr/bin/env bash
# Smoke-test the user-scope bootstrap.
#
# Drives scripts/setup-user-scope.sh against a temp HOME, then verifies:
#   - All hooks installed and executable
#   - All skills installed
#   - All rules installed
#   - settings.json is valid JSON with expected plugins + hooks
#   - check-user-scope.sh reports OK
#   - Re-running with --update is a no-op (idempotent)
#   - --diff mode doesn't write
set -euo pipefail

JANUS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_HOME="$(mktemp -d -t janus-bootstrap-XXXXXX)"
PASS=0
FAIL=0

cleanup() { rm -rf "$TEST_HOME"; }
trap cleanup EXIT

assert_file() {
  if [ -f "$1" ]; then
    PASS=$((PASS + 1))
  else
    echo "FAIL: missing file $1"
    FAIL=$((FAIL + 1))
  fi
}

assert_executable() {
  if [ -x "$1" ]; then
    PASS=$((PASS + 1))
  else
    echo "FAIL: not executable $1"
    FAIL=$((FAIL + 1))
  fi
}

assert_jq() {
  if jq -e "$2" "$1" >/dev/null 2>&1; then
    PASS=$((PASS + 1))
  else
    echo "FAIL: jq query failed: $2 against $1"
    FAIL=$((FAIL + 1))
  fi
}

echo "Bootstrap smoke test"
echo "  janus root:  $JANUS_ROOT"
echo "  test HOME:   $TEST_HOME"
echo

# ─── 1. Initial install ──────────────────────────────────────────────
echo "--- Initial install ---"
if ! bash "$JANUS_ROOT/scripts/setup-user-scope.sh" --target "$TEST_HOME" >/dev/null 2>&1; then
  echo "FAIL: initial setup-user-scope.sh failed"
  exit 1
fi

# Hooks present + executable
for h in stop-memory-check.sh ts-check-on-edit.sh; do
  assert_file "$TEST_HOME/.claude/hooks/$h"
  assert_executable "$TEST_HOME/.claude/hooks/$h"
done

# Skills
for s in bugfix sprint spawn-fleet activity-report workflow-fix; do
  assert_file "$TEST_HOME/.claude/skills/$s/SKILL.md"
done
# Skill scripts that need +x
assert_executable "$TEST_HOME/.claude/skills/workflow-fix/collect.sh"
assert_executable "$TEST_HOME/.claude/skills/activity-report/report.py"

# Rules
for r in fetch-before-work github-pagination issue-on-discovery tool-fallbacks trust-user-diagnosis worktree-safety; do
  assert_file "$TEST_HOME/.claude/rules/$r.md"
done

# CLAUDE.md
assert_file "$TEST_HOME/.claude/CLAUDE.md"

# settings.json structure
assert_file "$TEST_HOME/.claude/settings.json"
assert_jq "$TEST_HOME/.claude/settings.json" '.enabledPlugins["superpowers@claude-plugins-official"] == true'
assert_jq "$TEST_HOME/.claude/settings.json" '.enabledPlugins["context7@claude-plugins-official"] == true'
assert_jq "$TEST_HOME/.claude/settings.json" '.enabledPlugins["typescript-lsp@claude-plugins-official"] == true'
assert_jq "$TEST_HOME/.claude/settings.json" '.hooks.Stop[0].hooks[0].command | endswith("/stop-memory-check.sh")'
assert_jq "$TEST_HOME/.claude/settings.json" '.hooks.PostToolUse[0].matcher == "Edit|Write|MultiEdit"'

# Hook command path must NOT contain literal $HOME_PLACEHOLDER
if grep -q 'HOME_PLACEHOLDER' "$TEST_HOME/.claude/settings.json"; then
  echo "FAIL: HOME_PLACEHOLDER not substituted in settings.json"
  FAIL=$((FAIL + 1))
else
  PASS=$((PASS + 1))
fi

# ─── 2. check-user-scope reports OK ──────────────────────────────────
echo "--- check-user-scope ---"
if bash "$JANUS_ROOT/scripts/check-user-scope.sh" --target "$TEST_HOME" --quiet; then
  PASS=$((PASS + 1))
else
  echo "FAIL: check-user-scope.sh exited non-zero on a fresh install"
  FAIL=$((FAIL + 1))
fi

# ─── 3. Idempotency — second run is a no-op ──────────────────────────
echo "--- Idempotency ---"
SECOND_RUN=$(bash "$JANUS_ROOT/scripts/setup-user-scope.sh" --target "$TEST_HOME" 2>&1)
if echo "$SECOND_RUN" | grep -q "Installed: 0"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: second run installed something (expected 0):"
  echo "$SECOND_RUN" | tail -3
  FAIL=$((FAIL + 1))
fi

# ─── 4. --dry-run mode doesn't write ─────────────────────────────────
echo "--- Dry-run ---"
TEST_HOME_DRY="$(mktemp -d -t janus-bootstrap-dry-XXXXXX)"
bash "$JANUS_ROOT/scripts/setup-user-scope.sh" --target "$TEST_HOME_DRY" --dry-run >/dev/null 2>&1
if [ ! -d "$TEST_HOME_DRY/.claude" ] || [ ! "$(ls -A "$TEST_HOME_DRY/.claude/hooks" 2>/dev/null)" ]; then
  PASS=$((PASS + 1))
else
  echo "FAIL: --dry-run wrote files"
  FAIL=$((FAIL + 1))
fi
rm -rf "$TEST_HOME_DRY"

# ─── 5. --force overwrites a customised file ─────────────────────────
echo "--- Force overwrite ---"
echo "user-edited content" > "$TEST_HOME/.claude/CLAUDE.md"
bash "$JANUS_ROOT/scripts/setup-user-scope.sh" --target "$TEST_HOME" --force >/dev/null 2>&1
if grep -q 'User-scope Claude Code' "$TEST_HOME/.claude/CLAUDE.md"; then
  PASS=$((PASS + 1))
else
  echo "FAIL: --force did not overwrite customised CLAUDE.md"
  FAIL=$((FAIL + 1))
fi

# ─── 6. settings.json merge preserves user keys ──────────────────────
echo "--- Settings merge preserves user keys ---"
TEST_HOME_MERGE="$(mktemp -d -t janus-bootstrap-merge-XXXXXX)"
mkdir -p "$TEST_HOME_MERGE/.claude"
echo '{"customUserKey": "preserved", "cleanupPeriodDays": 30}' > "$TEST_HOME_MERGE/.claude/settings.json"
bash "$JANUS_ROOT/scripts/setup-user-scope.sh" --target "$TEST_HOME_MERGE" >/dev/null 2>&1
# Custom key should still be there
if jq -e '.customUserKey == "preserved"' "$TEST_HOME_MERGE/.claude/settings.json" >/dev/null 2>&1; then
  PASS=$((PASS + 1))
else
  echo "FAIL: jq merge clobbered customUserKey"
  FAIL=$((FAIL + 1))
fi
# But janus baseline keys should also be present
if jq -e '.enabledPlugins["superpowers@claude-plugins-official"] == true' "$TEST_HOME_MERGE/.claude/settings.json" >/dev/null 2>&1; then
  PASS=$((PASS + 1))
else
  echo "FAIL: jq merge didn't add janus baseline plugins"
  FAIL=$((FAIL + 1))
fi
# Backup file should exist
if ls "$TEST_HOME_MERGE/.claude/settings.json.bak."* >/dev/null 2>&1; then
  PASS=$((PASS + 1))
else
  echo "FAIL: no backup created"
  FAIL=$((FAIL + 1))
fi
rm -rf "$TEST_HOME_MERGE"

echo
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
