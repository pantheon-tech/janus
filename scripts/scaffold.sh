#!/usr/bin/env bash
# janus — scaffold a new project from templates
#
# Usage: ./scripts/scaffold.sh [target_dir]
# Interactive — prompts for archetype, name, features, plugins.
#
# Status: WORKING for the prompt + plugin-selection logic.
# File-overlay rendering is partial — emits the .claude/ directory and
# AGENTS.md/CLAUDE.md/README; archetype-specific scaffold (src/, infra/)
# is still TODO and printed as "next steps" at the end.

set -euo pipefail

JANUS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JANUS_VERSION="$(grep '"version"' "${JANUS_ROOT}/package.json" | head -1 | awk -F'"' '{print $4}')"
MO="${JANUS_ROOT}/scripts/lib/mo"

echo "═══════════════════════════════════════════════"
echo "  janus v${JANUS_VERSION} — project scaffold"
echo "═══════════════════════════════════════════════"
echo

# ─── Preflight: required tools ───────────────────────────────────────────
# rsync was previously a hard dependency; replaced with cp + find for
# portability (rsync is not in default container/devcontainer images).
for tool in git jq pnpm bash; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Error: '$tool' is required but not installed."; exit 1;
  }
done
[ -x "$MO" ] || { echo "Error: vendored mo missing at ${MO}"; exit 1; }

# ─── Detect / prompt: GitHub identity ────────────────────────────────────
GIT_USER_NAME=$(git config --global user.name 2>/dev/null || echo "")
GIT_USER_EMAIL=$(git config --global user.email 2>/dev/null || echo "")
GH_DEFAULT_ORG=$(gh api user --jq '.login' 2>/dev/null || echo "")

read -r -p "GitHub org/user [${GH_DEFAULT_ORG}]: " GITHUB_ORG
GITHUB_ORG="${GITHUB_ORG:-${GH_DEFAULT_ORG}}"
if [ -z "$GITHUB_ORG" ]; then
  echo "Error: GitHub org/user is required."
  exit 1
fi

read -r -p "Author name [${GIT_USER_NAME}]: " AUTHOR
AUTHOR="${AUTHOR:-${GIT_USER_NAME}}"

read -r -p "Author email [${GIT_USER_EMAIL}]: " AUTHOR_EMAIL
AUTHOR_EMAIL="${AUTHOR_EMAIL:-${GIT_USER_EMAIL}}"

# ─── Project basics ──────────────────────────────────────────────────────
read -r -p "Workload slug (3-12 chars, lowercase, a-z0-9): " WORKLOAD
if ! [[ "$WORKLOAD" =~ ^[a-z][a-z0-9]{2,11}$ ]]; then
  echo "Error: workload must be 3-12 chars, lowercase a-z0-9, starting with a letter."
  exit 1
fi

read -r -p "Description: " DESCRIPTION

read -r -p "License [MIT]: " LICENSE
LICENSE="${LICENSE:-MIT}"

read -r -p "Azure region [australiaeast]: " REGION
REGION="${REGION:-australiaeast}"

TARGET_DIR="${1:-${HOME}/git/${WORKLOAD}}"
read -r -p "Target directory [${TARGET_DIR}]: " ENTERED_TARGET
TARGET_DIR="${ENTERED_TARGET:-${TARGET_DIR}}"

if [ -e "$TARGET_DIR" ] && [ "$(ls -A "$TARGET_DIR" 2>/dev/null || true)" ]; then
  echo "Error: ${TARGET_DIR} already exists and is non-empty."
  exit 1
fi

# ─── Archetype ───────────────────────────────────────────────────────────
echo
echo "Archetypes:"
echo "  1) backend-functions       — Azure Functions v4"
echo "  2) backend-container-app   — Container App (long-running, WebSockets)"
echo "  3) frontend-vite-react     — Vite + React + MSAL → SWA"
echo "  4) generic-ts              — Minimal TS package (libraries, CLIs, no Azure)"
echo "  5) types-package           — Pure-types npm package"
echo "  6) mcp-server              — Stdio MCP server"
echo "  7) monorepo-root           — pnpm workspace orchestrator"
echo
read -r -p "Pick archetype [1-7]: " ARCH_CHOICE
case "$ARCH_CHOICE" in
  1) ARCHETYPE="backend-functions" ;;
  2) ARCHETYPE="backend-container-app" ;;
  3) ARCHETYPE="frontend-vite-react" ;;
  4) ARCHETYPE="generic-ts" ;;
  5) ARCHETYPE="types-package" ;;
  6) ARCHETYPE="mcp-server" ;;
  7) ARCHETYPE="monorepo-root" ;;
  *) echo "Invalid choice."; exit 1 ;;
esac

# ─── Feature questions for plugin selection ──────────────────────────────
echo
echo "Project features (used to select Claude Code plugins to enable):"

ask_yn() {
  local prompt="$1"
  local default="${2:-n}"
  local answer
  read -r -p "  ${prompt} [${default}]: " answer
  answer="${answer:-${default}}"
  [[ "$answer" =~ ^[Yy] ]]
}

# Defaults inferred from archetype, then overridden by user
HAS_FRONTEND=false
HAS_BROWSER_E2E=false
HAS_PYTHON=false
USES_IMAGE_GEN=false

case "$ARCHETYPE" in
  frontend-vite-react)         HAS_FRONTEND=true; HAS_BROWSER_E2E=true ;;
  monorepo-root)               HAS_FRONTEND=true; HAS_BROWSER_E2E=true ;;
esac

if ask_yn "Has a frontend (React/Vite/etc.)?" "$([ "$HAS_FRONTEND" = true ] && echo y || echo n)"; then
  HAS_FRONTEND=true
else
  HAS_FRONTEND=false
fi

if ask_yn "Will use Playwright for browser E2E?" "$([ "$HAS_BROWSER_E2E" = true ] && echo y || echo n)"; then
  HAS_BROWSER_E2E=true
else
  HAS_BROWSER_E2E=false
fi

if ask_yn "Has any Python code?" "n"; then
  HAS_PYTHON=true
fi

if ask_yn "Will use AI image generation (banana-claude)?" "n"; then
  USES_IMAGE_GEN=true
fi

# ─── Determine plugins to enable in project .claude/settings.json ───────
PLUGINS=()
$HAS_FRONTEND && PLUGINS+=("frontend-design@claude-plugins-official")
$HAS_BROWSER_E2E && PLUGINS+=("playwright@claude-plugins-official")
$HAS_PYTHON && PLUGINS+=("pyright-lsp@claude-plugins-official")
$USES_IMAGE_GEN && PLUGINS+=("banana-claude@banana-claude-marketplace")

# Universal plugins are at user scope (superpowers, context7, typescript-lsp)
# — we don't redundantly enable them at project scope.

echo
echo "═══════════════════════════════════════════════"
echo "  Summary"
echo "═══════════════════════════════════════════════"
echo "  Workload:    ${WORKLOAD}"
echo "  GitHub:      ${GITHUB_ORG}/${WORKLOAD}"
echo "  Author:      ${AUTHOR} <${AUTHOR_EMAIL}>"
echo "  Archetype:   ${ARCHETYPE}"
echo "  Target:      ${TARGET_DIR}"
echo "  Project plugins to enable:"
if [ ${#PLUGINS[@]} -eq 0 ]; then
  echo "    (none — only user-scope plugins apply)"
else
  for p in "${PLUGINS[@]}"; do echo "    - ${p}"; done
fi
echo "═══════════════════════════════════════════════"
echo
read -r -p "Proceed? [y/N]: " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy] ]]; then
  echo "Aborted."
  exit 0
fi

# ─── Render helper: pipe a template through mo with the slot env ─────────
# All slot values are exported once; mo reads them from the environment.
export workload="$WORKLOAD"
export description="$DESCRIPTION"
export archetype="$ARCHETYPE"
export github_org="$GITHUB_ORG"
export author="$AUTHOR"
export author_email="$AUTHOR_EMAIL"
export node_version="24"
export license="$LICENSE"
export region="$REGION"
export template_version="v${JANUS_VERSION}"
export year="$(date +%Y)"
export date="$(date +%Y-%m-%d)"

render_tmpl() {
  local src="$1" out="$2"
  mkdir -p "$(dirname "$out")"
  "$MO" "$src" > "$out"
}

# ─── Create target tree ──────────────────────────────────────────────────
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

SHARED="${JANUS_ROOT}/templates/_shared"
ARCH_DIR="${JANUS_ROOT}/templates/${ARCHETYPE}"

# Build an exclude predicate from <archetype>/.exclude. Each non-comment line
# is a path (relative to _shared/) to drop. A trailing slash matches the
# directory and everything under it; otherwise it's an exact-path match.
# Returns 0 (skip) if the relative path is excluded, 1 (keep) otherwise.
is_excluded() {
  local rel="$1"
  [ -f "${ARCH_DIR}/.exclude" ] || return 1
  local pattern
  while IFS= read -r pattern || [ -n "$pattern" ]; do
    # Strip CR (in case the file has CRLF), trim whitespace, skip blanks/comments.
    pattern="${pattern%$'\r'}"
    pattern="${pattern#"${pattern%%[![:space:]]*}"}"
    pattern="${pattern%"${pattern##*[![:space:]]}"}"
    [ -z "$pattern" ] && continue
    [[ "$pattern" == \#* ]] && continue
    if [[ "$pattern" == */ ]]; then
      # Directory: match this path or anything underneath.
      [[ "$rel" == "${pattern%/}" || "$rel" == "${pattern}"* ]] && return 0
    else
      [[ "$rel" == "$pattern" ]] && return 0
    fi
  done < "${ARCH_DIR}/.exclude"
  return 1
}

# 1. Copy verbatim files (everything not ending in .tmpl)
#    Done with cp + find — no rsync dependency.
( cd "$SHARED" && find . -type f ! -name '*.tmpl' -print0 | while IFS= read -r -d '' f; do
    rel="${f#./}"
    if is_excluded "$rel"; then continue; fi
    dest="${TARGET_DIR}/${rel}"
    mkdir -p "$(dirname "$dest")"
    cp "$f" "$dest"
  done
)

# 2. Render .tmpl files with substitution, dropping the .tmpl suffix
while IFS= read -r tmpl; do
  rel="${tmpl#${SHARED}/}"
  if is_excluded "$rel"; then continue; fi
  out="${rel%.tmpl}"
  render_tmpl "$tmpl" "$out"
done < <(find "$SHARED" -name '*.tmpl' -type f)

# 2b. Apply archetype overlays. Each archetype directory under templates/
#     may contain:
#       - .env.example      → appended to the shared minimal .env.example
#       - package.json.tmpl → merged over the shared package.json (jq deep merge)
#       - .exclude          → list of _shared/ paths to skip (handled in steps 1+2)
#       - any other files   → copied verbatim, with .tmpl suffix stripped + rendered
#     Anything not listed (README.md, etc.) is rendered through mo when .tmpl,
#     copied verbatim otherwise.
if [ -d "$ARCH_DIR" ]; then
  # 2b.i — .env.example overlay (append to the shared minimal one)
  if [ -f "${ARCH_DIR}/.env.example" ]; then
    {
      echo
      cat "${ARCH_DIR}/.env.example"
    } >> "${TARGET_DIR}/.env.example"
  fi

  # 2b.ii — package.json.tmpl overlay (jq deep-merge over shared)
  if [ -f "${ARCH_DIR}/package.json.tmpl" ]; then
    overlay_rendered="$(mktemp)"
    "$MO" "${ARCH_DIR}/package.json.tmpl" > "$overlay_rendered"
    merged="$(mktemp)"
    jq -s '.[0] * .[1]' "${TARGET_DIR}/package.json" "$overlay_rendered" > "$merged"
    mv "$merged" "${TARGET_DIR}/package.json"
    rm -f "$overlay_rendered"
  fi

  # 2b.ii.b — if the archetype excludes infra/, the inherited deploy:* scripts
  #           reference an `infra/deploy.sh` that won't exist. Strip them so the
  #           merged package.json is internally consistent.
  # infra_excluded(): explicit check — reads .exclude directly for the 'infra/'
  # line rather than routing through is_excluded(), which takes a path argument
  # not a pattern string.
  infra_excluded() {
    [ -f "${ARCH_DIR}/.exclude" ] && grep -qxF 'infra/' "${ARCH_DIR}/.exclude"
  }
  if infra_excluded; then
    pruned="$(mktemp)"
    jq 'if .scripts then .scripts |= del(."deploy:staging", ."deploy:prod") else . end' \
      "${TARGET_DIR}/package.json" > "$pruned"
    mv "$pruned" "${TARGET_DIR}/package.json"
  fi

  # 2b.iii — copy/render everything else from the archetype directory.
  #          The archetype's own README.md at the root is META documentation
  #          (about the archetype) — never shipped into scaffolded projects.
  ( cd "$ARCH_DIR" && find . -type f \
      ! -name '.env.example' \
      ! -path './package.json.tmpl' \
      ! -name '.exclude' \
      ! -path './README.md' \
      -print0 | while IFS= read -r -d '' f; do
        rel="${f#./}"
        dest="${TARGET_DIR}/${rel}"
        mkdir -p "$(dirname "$dest")"
        if [[ "$rel" == *.tmpl ]]; then
          out="${dest%.tmpl}"
          "$MO" "$f" > "$out"
        else
          cp "$f" "$dest"
        fi
      done
  )
fi

# 3. Snapshot conventions docs from janus into the target so the project has
#    its own reference copy (decoupled from janus version drift).
if [ -d "${JANUS_ROOT}/docs/conventions" ]; then
  mkdir -p docs/conventions
  cp -R "${JANUS_ROOT}/docs/conventions/." docs/conventions/
fi

# 4. Generate project .claude/settings.json with selected plugins.
#    This is the single source of truth — there is no template counterpart;
#    permissions block lives here so it cannot drift.
mkdir -p .claude
SETTINGS_BASE=$(jq -n \
  --arg workload "$WORKLOAD" \
  '{
    env: { OTEL_RESOURCE_ATTRIBUTES: ("project=" + $workload) },
    worktree: { symlinkDirectories: ["node_modules"] },
    permissions: {
      allow: [
        "Bash(pnpm *)",
        "Bash(npx tsc *)",
        "Bash(gh *)",
        "Bash(git status:*)",
        "Bash(git diff:*)",
        "Bash(git log:*)",
        "Read(**)",
        "Grep(**)",
        "WebFetch(https://code.claude.com/*)",
        "WebFetch(https://docs.claude.com/*)",
        "WebFetch(https://learn.microsoft.com/*)"
      ],
      deny: [
        "Bash(rm -rf *)",
        "Bash(sudo *)",
        "Bash(git push --force:*)",
        "Bash(git push * main)",
        "Bash(npm publish *)",
        "Bash(pnpm publish *)"
      ]
    },
    cleanupPeriodDays: 7
  }')

if [ ${#PLUGINS[@]} -gt 0 ]; then
  PLUGINS_JSON=$(printf '%s\n' "${PLUGINS[@]}" \
    | jq -R . | jq -s 'map({(.): true}) | add')
  echo "$SETTINGS_BASE" \
    | jq --argjson plugins "$PLUGINS_JSON" '. + {enabledPlugins: $plugins}' \
    > .claude/settings.json
else
  echo "$SETTINGS_BASE" > .claude/settings.json
fi

# 5. Generate pnpm lockfile so the first push to CI does not fail on
#    `pnpm install --frozen-lockfile`.
if [ -f package.json ]; then
  if ! pnpm install --lockfile-only --silent 2>/dev/null \
    && ! pnpm install --lockfile-only; then
    echo "WARNING: pnpm install --lockfile-only failed — pnpm-lock.yaml not generated." >&2
    echo "  The first CI push will fail. Investigate before pushing." >&2
    exit 1
  fi
fi

# 6. Init git on staging (working branch); also create main pointing at the
#    same initial commit so the user can `git push -u origin main` later
#    without an extra step.
git init -q -b staging
git add -A
git -c user.name="$AUTHOR" -c user.email="$AUTHOR_EMAIL" commit -q -m "chore: initial scaffold from janus v${JANUS_VERSION}

Archetype: ${ARCHETYPE}
" || true
# Create main branch at the initial commit (idempotent if branch exists)
git branch main 2>/dev/null || true

# ─── Post-scaffold checklist ─────────────────────────────────────────────
cat <<EOF

═══════════════════════════════════════════════
  Scaffolded ${WORKLOAD} (${ARCHETYPE})
═══════════════════════════════════════════════

Location: ${TARGET_DIR}
Branches: staging (default working branch), main (production)

Next steps:

  1. cd ${TARGET_DIR}

  2. Review and complete:
     - .env.example (define every var the project needs)
     - AGENTS.md (fill in archetype-specific Critical Context)
     - infra/main.bicep (if Azure-deploying — composing from AVM)
     - src/ (archetype-specific scaffold is currently TODO; fill in by hand
       referring to docs/ in this project + docs/conventions/)

  3. Create the GitHub repo and push both branches:
       gh repo create ${GITHUB_ORG}/${WORKLOAD} --private --source=. --remote=origin
       git push -u origin staging
       git push -u origin main

  4. Set up GitHub environments:
       - 'staging' (auto-deploy from staging branch)
       - 'prod'    (required reviewers; deploys from main)

  5. For Azure deploys, run:
       bash infra/scripts/setup-oidc.sh

  6. Configure branch protection on 'main':
       - Require PR before merging
       - Require ci-pass status check
       - Require linear history

  7. Add repo secrets:
       - CLAUDE_CODE_OAUTH_TOKEN (from \`claude setup-token\`)
       - ACTIONS_PAT (PAT with repo scope — needed for claude-autofix to
         trigger downstream @claude workflow)
       - AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID (per env)
EOF
