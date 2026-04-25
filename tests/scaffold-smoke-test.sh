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
# Per-archetype deep verification (typecheck/lint/test/build) runs after the
# base structural check for selected archetypes (2, 6, 7).
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
#   1. GitHub org/user      6. License (blank → MIT)         11. Browser E2E?
#   2. Author name          7. Azure region (blank → AE)     12. Has Python?
#   3. Author email         8. Target directory              13. Image gen?
#   4. Workload slug        9. Archetype number              14. Proceed?
#   5. Description         10. Has frontend?
run_scaffold() {
  local target="$1" arch_num="$2"
  printf 'testorg\nTest User\ntest@example.com\ntestapp\nTest scaffold project\n\n\n%s\n%s\nn\nn\nn\nn\ny\n' \
    "$target" "$arch_num" \
    | bash "${JANUS_ROOT}/scripts/scaffold.sh" "$target" >/dev/null 2>&1
}

# ─── Base structural verifier (runs for every archetype) ───────────────
verify_project() {
  local target="$1" arch_num="$2"
  local -a errors=()

  # Unsubstituted <%slot%> tokens. Skip GitHub Actions ${{ ... }} expressions.
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
    echo " $branches " | grep -q ' staging ' || errors+=("staging branch missing (have: $branches)")
    echo " $branches " | grep -q ' main '    || errors+=("main branch missing (have: $branches)")
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

  # pnpm install --lockfile-only must succeed in rendered project.
  # (skipped for monorepo-root: workspace install needs full resolution)
  if [ -f "$target/package.json" ] && [ "$arch_num" != "7" ]; then
    if ! ( cd "$target" && pnpm install --lockfile-only --silent ) >/dev/null 2>&1; then
      errors+=("pnpm install --lockfile-only failed in rendered project")
    fi
  fi

  if [ ${#errors[@]} -eq 0 ]; then
    echo "PASS: archetype $arch_num"; PASS=$((PASS + 1))
  else
    echo "FAIL: archetype $arch_num"
    for e in "${errors[@]}"; do echo "  - $e"; done
    FAIL=$((FAIL + 1))
  fi
}

# ─── Deep verifiers (runtime checks) ───────────────────────────────────

# archetype 2: backend-container-app — typecheck/lint/test/build, dist/server.js
verify_container_app() {
  local target="$1"
  local -a errors=()

  for f in Dockerfile infra/main.bicep ".github/workflows/deploy.yml"; do
    [ -f "$target/$f" ] || errors+=("Missing shipped file: $f")
  done

  if ! ( cd "$target" && pnpm install --silent ) >/dev/null 2>&1; then
    echo "FAIL: archetype 2 (extended) — pnpm install failed"
    FAIL=$((FAIL + 1)); return
  fi

  ( cd "$target" && pnpm typecheck >/dev/null 2>&1 ) || errors+=("pnpm typecheck failed")
  ( cd "$target" && pnpm lint      >/dev/null 2>&1 ) || errors+=("pnpm lint failed")
  ( cd "$target" && pnpm test      >/dev/null 2>&1 ) || errors+=("pnpm test failed")
  if ! ( cd "$target" && pnpm build >/dev/null 2>&1 ); then
    errors+=("pnpm build failed")
  elif [ ! -f "$target/dist/server.js" ]; then
    errors+=("pnpm build succeeded but dist/server.js is missing")
  fi

  if [ ${#errors[@]} -eq 0 ]; then
    echo "PASS: archetype 2 (extended)"; PASS=$((PASS + 1))
  else
    echo "FAIL: archetype 2 (extended)"
    for e in "${errors[@]}"; do echo "  - $e"; done
    FAIL=$((FAIL + 1))
  fi
}

# archetype 6: mcp-server — typecheck/lint/test/build, dist/index.js shebang+exec, no stdout-on-EOF
verify_mcp_server() {
  local target="$1"
  local -a errors=()

  if ! ( cd "$target" && pnpm install --silent ) >/dev/null 2>&1; then
    echo "FAIL: archetype 6 (deep) — pnpm install failed"
    FAIL=$((FAIL + 1)); return
  fi

  ( cd "$target" && pnpm typecheck >/dev/null 2>&1 ) || errors+=("pnpm typecheck failed")
  ( cd "$target" && pnpm lint      >/dev/null 2>&1 ) || errors+=("pnpm lint failed")
  ( cd "$target" && pnpm test      >/dev/null 2>&1 ) || errors+=("pnpm test failed")
  ( cd "$target" && pnpm build     >/dev/null 2>&1 ) || errors+=("pnpm build failed")

  if [ ! -f "$target/dist/index.js" ]; then
    errors+=("dist/index.js missing after build")
  else
    local first_line
    first_line=$(head -1 "$target/dist/index.js")
    [ "$first_line" = "#!/usr/bin/env node" ] || errors+=("dist/index.js missing shebang (got: $first_line)")
    [ -x "$target/dist/index.js" ] || errors+=("dist/index.js not executable")
    local stdout_out
    stdout_out=$(node "$target/dist/index.js" < /dev/null 2>/dev/null || true)
    [ -z "$stdout_out" ] || errors+=("dist/index.js wrote unexpected stdout on EOF")
  fi

  [ ! -d "$target/infra" ] || errors+=("infra/ present but should be excluded")
  [ ! -f "$target/.github/workflows/deploy.yml" ] || errors+=("deploy.yml present but should be excluded")

  if [ ${#errors[@]} -eq 0 ]; then
    echo "PASS: archetype 6 (deep)"; PASS=$((PASS + 1))
  else
    echo "FAIL: archetype 6 (deep)"
    for e in "${errors[@]}"; do echo "  - $e"; done
    FAIL=$((FAIL + 1))
  fi
}

# archetype 7: monorepo-root — full workspace install, recursive typecheck/lint/test
verify_monorepo() {
  local target="$1"
  local -a errors=()

  [ -f "$target/pnpm-workspace.yaml" ] || errors+=("pnpm-workspace.yaml missing")
  for f in packages/example/package.json packages/example/src/index.ts \
           packages/example/tests/index.test.ts packages/example/tsconfig.json; do
    [ -f "$target/$f" ] || errors+=("Required file missing: $f")
  done

  if ! ( cd "$target" && pnpm install --silent ) >/dev/null 2>&1; then
    errors+=("pnpm install (workspace) failed")
  else
    ( cd "$target" && pnpm typecheck >/dev/null 2>&1 ) || errors+=("pnpm typecheck failed")
    ( cd "$target" && pnpm lint      >/dev/null 2>&1 ) || errors+=("pnpm lint failed")
    ( cd "$target" && pnpm test      >/dev/null 2>&1 ) || errors+=("pnpm test failed")
  fi

  if [ ${#errors[@]} -eq 0 ]; then
    echo "PASS: archetype 7 (workspace)"; PASS=$((PASS + 1))
  else
    echo "FAIL: archetype 7 (workspace)"
    for e in "${errors[@]}"; do echo "  - $e"; done
    FAIL=$((FAIL + 1))
  fi
}

# ─── Drive ─────────────────────────────────────────────────────────────
echo "Smoke-testing janus scaffold..."
echo "  janus root: $JANUS_ROOT"
echo "  scratch:    $TEST_BASE"
echo

# Cover all 7 archetypes.
#   1 backend-functions       — Azure Functions slots
#   2 backend-container-app   — + extended acid test (build → dist/server.js)
#   3 frontend-vite-react     — React/Vite/MSAL/Tailwind v4
#   4 generic-ts              — minimal path
#   5 types-package           — pure-types, no runtime
#   6 mcp-server              — + deep test (build → dist/index.js, shebang/exec)
#   7 monorepo-root           — + workspace acid test
for arch_num in 1 2 3 4 5 6 7; do
  target="${TEST_BASE}/test-${arch_num}"
  echo "--- Archetype $arch_num ---"
  if ! run_scaffold "$target" "$arch_num"; then
    echo "FAIL: archetype $arch_num — scaffold script errored"
    FAIL=$((FAIL + 1))
    continue
  fi
  verify_project "$target" "$arch_num"
  case "$arch_num" in
    2) verify_container_app "$target" ;;
    6) verify_mcp_server "$target" ;;
    7) verify_monorepo "$target" ;;
  esac
done

echo
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
