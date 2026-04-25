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

echo "Smoke-testing janus scaffold..."
echo "  janus root: $JANUS_ROOT"
echo "  scratch:    $TEST_BASE"
echo

# Extended verification for backend-container-app (archetype 2):
# Runs the full acid-test suite — typecheck, lint, test, build — on top of the
# base verify_project checks.
verify_container_app() {
  local target="$1"
  local -a errors=()

  # Required shipped files
  for f in Dockerfile infra/main.bicep ".github/workflows/deploy.yml"; do
    if [ ! -f "$target/$f" ]; then
      errors+=("Missing shipped file: $f")
    fi
  done

  # Full install needed for typecheck/test/build (scaffold only ran --lockfile-only).
  if ! ( cd "$target" && pnpm install --silent ) >/dev/null 2>&1; then
    errors+=("pnpm install failed (extended)")
    # Can't proceed with remaining checks without node_modules.
    echo "FAIL: archetype 2 (extended)"
    for e in "${errors[@]}"; do echo "  - $e"; done
    FAIL=$((FAIL + 1))
    return
  fi

  # pnpm typecheck
  if ! ( cd "$target" && pnpm typecheck ) >/dev/null 2>&1; then
    errors+=("pnpm typecheck failed")
  fi

  # pnpm lint
  if ! ( cd "$target" && pnpm lint ) >/dev/null 2>&1; then
    errors+=("pnpm lint failed")
  fi

  # pnpm test
  if ! ( cd "$target" && pnpm test ) >/dev/null 2>&1; then
    errors+=("pnpm test failed")
  fi

  # pnpm build → dist/server.js must exist
  if ! ( cd "$target" && pnpm build ) >/dev/null 2>&1; then
    errors+=("pnpm build failed")
  elif [ ! -f "$target/dist/server.js" ]; then
    errors+=("pnpm build succeeded but dist/server.js is missing")
  fi

  if [ ${#errors[@]} -eq 0 ]; then
    echo "PASS: archetype 2 (extended)"
    PASS=$((PASS + 1))
  else
    echo "FAIL: archetype 2 (extended)"
    for e in "${errors[@]}"; do echo "  - $e"; done
    FAIL=$((FAIL + 1))
  fi
}

# Cover the two simplest archetypes for now. backend-functions exercises the
# Azure-flavoured slots; generic-ts exercises the minimal path.
# Archetype 2 (backend-container-app) gets a deeper acid-test as well.
for arch_num in 1 2 4; do
  target="${TEST_BASE}/test-${arch_num}"
  echo "--- Archetype $arch_num ---"
  if ! run_scaffold "$target" "$arch_num"; then
    echo "FAIL: archetype $arch_num — scaffold script errored"
    FAIL=$((FAIL + 1))
    continue
  fi
  verify_project "$target" "$arch_num"
  if [ "$arch_num" -eq 2 ]; then
    verify_container_app "$target"
  fi
done

echo
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
