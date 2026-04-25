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
# base structural check for selected archetypes (1, 2, 3, 6, 7).
#
# CI fails on any of these. Run locally with:  bash tests/scaffold-smoke-test.sh

set -euo pipefail

JANUS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_BASE="$(mktemp -d -t janus-smoke-XXXXXX)"
PASS=0
FAIL=0

cleanup() { rm -rf "$TEST_BASE"; }
trap cleanup EXIT

# ─── Prompt-count guard ─────────────────────────────────────────────────────
# run_scaffold() feeds exactly 14 answers. If scaffold.sh adds or removes a
# prompt without updating this test, the answers shift silently and the test
# produces wrong results. Count both forms of prompt:
#   - direct `read -r -p` lines (minus 1 for the one inside ask_yn's body)
#   - `ask_yn` call sites (each expands to one internal read)
# SYNC THIS COUNT when adding/removing prompts in scripts/scaffold.sh.
EXPECTED_PROMPTS=14
_direct_reads=$(grep -cE '^[[:space:]]*read -r -p ' "${JANUS_ROOT}/scripts/scaffold.sh")
_ask_yn_calls=$(grep -cE '^[[:space:]]*(if )?ask_yn ' "${JANUS_ROOT}/scripts/scaffold.sh")
# Subtract 1 for the read inside the ask_yn function definition itself.
ACTUAL_PROMPTS=$(( (_direct_reads - 1) + _ask_yn_calls ))
if [ "$ACTUAL_PROMPTS" -ne "$EXPECTED_PROMPTS" ]; then
  echo "ERROR: scaffold.sh has $ACTUAL_PROMPTS prompts but smoke test feeds $EXPECTED_PROMPTS answers."
  echo "  Update run_scaffold() and the EXPECTED_PROMPTS constant before re-running."
  exit 1
fi

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

  # Unsubstituted <%slot%> tokens — match the actual slot identifier shape:
  # an alpha/underscore start followed by alnum/underscore. This excludes
  #   - the pragma `<% %>` (space after `<%`)
  #   - GitHub Actions `${{ ... }}` (handled by `[^$]` lookbehind)
  #   - HTML-entity-escaped doc references like `&lt;%name%&gt;`
  local slot_hits
  slot_hits=$(grep -rEn '(^|[^$])<%[a-z_][a-z0-9_]*%>' \
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

  # Workflow YAML must parse. Prefers PyYAML (best diagnostics) but falls
  # back to `yq` (Go, no deps) if available, then to a minimal heuristic.
  # CI installs PyYAML in the smoke job; a fresh checkout without either
  # tool degrades to the heuristic with a one-line warning.
  if [ -d "$target/.github/workflows" ]; then
    local yaml_check
    if python3 -c 'import yaml' 2>/dev/null; then
      yaml_check='py'
    elif command -v yq >/dev/null 2>&1; then
      yaml_check='yq'
    else
      yaml_check='heuristic'
      echo "  (warn) no PyYAML or yq; YAML check is heuristic only" >&2
    fi
    while IFS= read -r f; do
      case "$yaml_check" in
        py)
          python3 -c "import sys, yaml; yaml.safe_load(open(sys.argv[1]))" "$f" 2>/dev/null \
            || errors+=("Invalid YAML: ${f#$target/}") ;;
        yq)
          yq eval '.' "$f" >/dev/null 2>&1 \
            || errors+=("Invalid YAML: ${f#$target/}") ;;
        heuristic)
          # Heuristic: file is non-empty and parses as TOP-LEVEL key:value pairs.
          [ -s "$f" ] && grep -qE '^[a-zA-Z_-]+:' "$f" \
            || errors+=("YAML heuristic failed (file empty or no top-level keys): ${f#$target/}") ;;
      esac
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

# archetype 1: backend-functions — typecheck/lint/test/build, dist/functions/health.js,
#              host.json + local.settings.json.example survive build
verify_backend_functions() {
  local target="$1"
  local -a errors=()

  if ! ( cd "$target" && pnpm install --silent ) >/dev/null 2>&1; then
    echo "FAIL: archetype 1 (deep) — pnpm install failed"
    FAIL=$((FAIL + 1)); return
  fi

  ( cd "$target" && pnpm typecheck >/dev/null 2>&1 ) || errors+=("pnpm typecheck failed")
  ( cd "$target" && pnpm lint      >/dev/null 2>&1 ) || errors+=("pnpm lint failed")
  ( cd "$target" && pnpm test      >/dev/null 2>&1 ) || errors+=("pnpm test failed")
  if ! ( cd "$target" && pnpm build >/dev/null 2>&1 ); then
    errors+=("pnpm build failed")
  elif [ ! -f "$target/dist/functions/health.js" ]; then
    errors+=("pnpm build succeeded but dist/functions/health.js is missing")
  fi

  # Azure Functions runtime config files must survive the build step.
  [ -f "$target/host.json" ]                    || errors+=("host.json missing after build")
  [ -f "$target/local.settings.json.example" ]  || errors+=("local.settings.json.example missing after build")

  if [ ${#errors[@]} -eq 0 ]; then
    echo "PASS: archetype 1 (deep)"; PASS=$((PASS + 1))
  else
    echo "FAIL: archetype 1 (deep)"
    for e in "${errors[@]}"; do echo "  - $e"; done
    FAIL=$((FAIL + 1))
  fi
}

# archetype 3: frontend-vite-react — typecheck/lint/test/build, dist/index.html + assets/
verify_frontend_react() {
  local target="$1"
  local -a errors=()

  if ! ( cd "$target" && pnpm install --silent ) >/dev/null 2>&1; then
    echo "FAIL: archetype 3 (deep) — pnpm install failed"
    FAIL=$((FAIL + 1)); return
  fi

  ( cd "$target" && pnpm typecheck >/dev/null 2>&1 ) || errors+=("pnpm typecheck failed")
  ( cd "$target" && pnpm lint      >/dev/null 2>&1 ) || errors+=("pnpm lint failed")
  ( cd "$target" && pnpm test      >/dev/null 2>&1 ) || errors+=("pnpm test failed")
  if ! ( cd "$target" && pnpm build >/dev/null 2>&1 ); then
    errors+=("pnpm build failed")
  else
    # Vite build must produce dist/index.html and a non-empty assets/ directory.
    [ -f "$target/dist/index.html" ]   || errors+=("dist/index.html missing after build")
    [ -d "$target/dist/assets" ]       || errors+=("dist/assets/ directory missing after build")
    # Tailwind v4 health: if Vite built successfully the full CSS pipeline ran.
  fi

  if [ ${#errors[@]} -eq 0 ]; then
    echo "PASS: archetype 3 (deep)"; PASS=$((PASS + 1))
  else
    echo "FAIL: archetype 3 (deep)"
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

  # Assert the example package name was rendered correctly (not left as @workspace/example).
  if [ -f "$target/packages/example/package.json" ]; then
    local pkg_name
    pkg_name=$(jq -r .name "$target/packages/example/package.json")
    if [[ "$pkg_name" != "@testapp/example" ]]; then
      errors+=("packages/example/package.json name is '$pkg_name', expected '@testapp/example'")
    fi
  fi

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
    1) verify_backend_functions "$target" ;;
    2) verify_container_app "$target" ;;
    3) verify_frontend_react "$target" ;;
    6) verify_mcp_server "$target" ;;
    7) verify_monorepo "$target" ;;
  esac
done

echo
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]
