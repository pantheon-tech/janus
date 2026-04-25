#!/usr/bin/env bash
# Smoke-test the janus scaffold script.
#
# Drives scripts/scaffold.sh non-interactively, then verifies the rendered
# project for the bugs that have surfaced silently in earlier reviews:
#   - Unsubstituted <%slot%> tokens in rendered files
#   - Invalid .claude/settings.json (or missing permissions block)
#   - Missing staging/main branches after init
#   - Workflow YAML that fails to parse
#   - pnpm install --lockfile-only that fails in the rendered project
#
# Archetype 7 (monorepo-root) also verifies:
#   - pnpm install (full workspace install) succeeds
#   - pnpm typecheck passes across all workspace packages
#   - pnpm lint passes across the workspace
#   - pnpm test passes across all workspace packages
#   - packages/example/ exists with src/, tests/, package.json
#   - pnpm-workspace.yaml exists
#
# CI fails on any of these. Run locally with:  bash tests/scaffold-smoke-test.sh

set -euo pipefail

JANUS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_BASE="$(mktemp -d -t janus-smoke-XXXXXX)"
PASS=0
FAIL=0

cleanup() { rm -rf "$TEST_BASE"; }
trap cleanup EXIT

# Answer order driven into scripts/scaffold.sh's prompts:
#   1. GitHub org/user
#   2. Author name
#   3. Author email
#   4. Workload slug
#   5. Description
#   6. License (blank → default MIT)
#   7. Azure region (blank → default australiaeast)
#   8. Target directory (overrides default)
#   9. Archetype number
#  10. Has frontend? (y/n)
#  11. Browser E2E? (y/n)
#  12. Has Python? (y/n)
#  13. Image gen? (y/n)
#  14. Proceed? (y/n)
run_scaffold() {
  local target="$1" arch_num="$2"
  printf 'testorg\nTest User\ntest@example.com\ntestapp\nTest scaffold project\n\n\n%s\n%s\nn\nn\nn\nn\ny\n' \
    "$target" "$arch_num" \
    | bash "${JANUS_ROOT}/scripts/scaffold.sh" "$target" >/dev/null 2>&1
}

verify_project() {
  local target="$1" arch_num="$2"
  local -a errors=()

  # Unsubstituted <%slot%> tokens. Skip GitHub Actions ${{ ... }} which is
  # not a janus slot. The leading-char alternation excludes `$<%`.
  local slot_hits
  slot_hits=$(grep -rEn '(^|[^$])<%[^%]' \
    --exclude-dir=node_modules --exclude-dir=.git \
    "$target" 2>/dev/null || true)
  if [ -n "$slot_hits" ]; then
    errors+=("Unsubstituted <%...%> slots:")
    while IFS= read -r line; do errors+=("    $line"); done <<<"$slot_hits"
  fi

  # .claude/settings.json must parse and have a permissions block.
  if [ ! -f "$target/.claude/settings.json" ]; then
    errors+=("Missing .claude/settings.json")
  else
    if ! jq . "$target/.claude/settings.json" >/dev/null 2>&1; then
      errors+=("Invalid JSON in .claude/settings.json")
    elif ! jq -e '.permissions.allow and .permissions.deny' \
            "$target/.claude/settings.json" >/dev/null 2>&1; then
      errors+=("Missing permissions.allow/deny in .claude/settings.json")
    fi
  fi

  # Both staging and main branches must exist after init.
  if [ -d "$target/.git" ]; then
    local branches
    branches=$(git -C "$target" branch --format='%(refname:short)' 2>/dev/null | tr '\n' ' ')
    if ! echo " $branches " | grep -q ' staging '; then
      errors+=("staging branch missing (have: $branches)")
    fi
    if ! echo " $branches " | grep -q ' main '; then
      errors+=("main branch missing (have: $branches)")
    fi
  else
    errors+=("Project is not a git repository")
  fi

  # Workflow YAML must parse.
  if [ -d "$target/.github/workflows" ]; then
    while IFS= read -r f; do
      if ! python3 -c "import sys, yaml; yaml.safe_load(open(sys.argv[1]))" "$f" 2>/dev/null; then
        errors+=("Invalid YAML: ${f#$target/}")
      fi
    done < <(find "$target/.github/workflows" -maxdepth 1 -name '*.yml' -type f)
  fi

  # pnpm install --lockfile-only succeeds in the rendered project. The
  # scaffold already runs this once, but re-run to catch regressions where
  # the lockfile drifts from package.json or a plugin produces a bad
  # package.json.
  if [ -f "$target/package.json" ]; then
    if ! ( cd "$target" && pnpm install --lockfile-only --silent ) >/dev/null 2>&1; then
      errors+=("pnpm install --lockfile-only failed in rendered project")
    fi
  fi

  if [ ${#errors[@]} -eq 0 ]; then
    echo "PASS: archetype $arch_num"
    PASS=$((PASS + 1))
  else
    echo "FAIL: archetype $arch_num"
    for e in "${errors[@]}"; do echo "  - $e"; done
    FAIL=$((FAIL + 1))
  fi
}

# Extra verification for monorepo-root (archetype 7): full workspace install,
# typecheck, lint, test, and required file/dir checks.
verify_monorepo() {
  local target="$1"
  local -a errors=()

  # pnpm-workspace.yaml must exist.
  if [ ! -f "$target/pnpm-workspace.yaml" ]; then
    errors+=("pnpm-workspace.yaml missing")
  fi

  # packages/example/ must exist with the expected files.
  for f in packages/example/package.json packages/example/src/index.ts \
            packages/example/tests/index.test.ts packages/example/tsconfig.json; do
    if [ ! -f "$target/$f" ]; then
      errors+=("Required file missing: $f")
    fi
  done

  # Full workspace install (not --lockfile-only — workspaces need real install
  # for typecheck/test to see package node_modules).
  if ! ( cd "$target" && pnpm install --frozen-lockfile=false --silent ) >/dev/null 2>&1; then
    errors+=("pnpm install failed")
  fi

  # typecheck across all packages.
  if ! ( cd "$target" && pnpm typecheck ) >/dev/null 2>&1; then
    errors+=("pnpm typecheck failed")
  fi

  # lint across workspace.
  if ! ( cd "$target" && pnpm lint ) >/dev/null 2>&1; then
    errors+=("pnpm lint failed")
  fi

  # test across all packages.
  if ! ( cd "$target" && pnpm test ) >/dev/null 2>&1; then
    errors+=("pnpm test failed")
  fi

  if [ ${#errors[@]} -eq 0 ]; then
    echo "PASS: archetype 7 (monorepo-root workspace checks)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: archetype 7 (monorepo-root workspace checks)"
    for e in "${errors[@]}"; do echo "  - $e"; done
    FAIL=$((FAIL + 1))
  fi
}

echo "Smoke-testing janus scaffold..."
echo "  janus root: $JANUS_ROOT"
echo "  scratch:    $TEST_BASE"
echo

# Cover the two simplest archetypes for now. backend-functions exercises the
# Azure-flavoured slots; generic-ts exercises the minimal path.
for arch_num in 1 4; do
  target="${TEST_BASE}/test-${arch_num}"
  echo "--- Archetype $arch_num ---"
  if ! run_scaffold "$target" "$arch_num"; then
    echo "FAIL: archetype $arch_num — scaffold script errored"
    FAIL=$((FAIL + 1))
    continue
  fi
  verify_project "$target" "$arch_num"
done

# Archetype 7: monorepo-root — run structural checks + workspace functional checks.
echo "--- Archetype 7 ---"
target="${TEST_BASE}/test-7"
if ! run_scaffold "$target" 7; then
  echo "FAIL: archetype 7 — scaffold script errored"
  FAIL=$((FAIL + 1))
else
  verify_project "$target" 7
  verify_monorepo "$target"
fi

echo
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
