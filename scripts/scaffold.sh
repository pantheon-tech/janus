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

echo "═══════════════════════════════════════════════"
echo "  janus v${JANUS_VERSION} — project scaffold"
echo "═══════════════════════════════════════════════"
echo

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

TARGET_DIR="${1:-${HOME}/git/${WORKLOAD}}"
read -r -p "Target directory [${TARGET_DIR}]: " ENTERED_TARGET
TARGET_DIR="${ENTERED_TARGET:-${TARGET_DIR}}"

if [ -e "$TARGET_DIR" ]; then
  echo "Error: ${TARGET_DIR} already exists."
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
HAS_BACKEND=false
HAS_BROWSER_E2E=false
HAS_PYTHON=false
USES_IMAGE_GEN=false

case "$ARCHETYPE" in
  frontend-vite-react)         HAS_FRONTEND=true; HAS_BROWSER_E2E=true ;;
  backend-functions|backend-container-app|mcp-server) HAS_BACKEND=true ;;
  monorepo-root)               HAS_FRONTEND=true; HAS_BACKEND=true; HAS_BROWSER_E2E=true ;;
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

# ─── Substitution helper ─────────────────────────────────────────────────
substitute() {
  local content="$1"
  echo "$content" \
    | sed "s|{{workload}}|${WORKLOAD}|g" \
    | sed "s|{{description}}|${DESCRIPTION}|g" \
    | sed "s|{{archetype}}|${ARCHETYPE}|g" \
    | sed "s|{{github_org}}|${GITHUB_ORG}|g" \
    | sed "s|{{author}}|${AUTHOR}|g" \
    | sed "s|{{author_email}}|${AUTHOR_EMAIL}|g" \
    | sed "s|{{node_version}}|24|g" \
    | sed "s|{{license}}|MIT|g" \
    | sed "s|{{region}}|australiaeast|g" \
    | sed "s|{{template_version}}|v${JANUS_VERSION}|g" \
    | sed "s|{{year}}|$(date +%Y)|g" \
    | sed "s|{{date}}|$(date +%Y-%m-%d)|g"
}

# ─── Create target tree ──────────────────────────────────────────────────
mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

SHARED="${JANUS_ROOT}/templates/_shared"

# 1. Copy verbatim files (everything not ending in .tmpl)
rsync -a --exclude='*.tmpl' --exclude='README.md' "${SHARED}/" .

# 2. Render .tmpl files with substitution, dropping the .tmpl suffix
while IFS= read -r tmpl; do
  rel="${tmpl#${SHARED}/}"
  out="${rel%.tmpl}"
  mkdir -p "$(dirname "$out")"
  substitute "$(cat "$tmpl")" > "$out"
done < <(find "$SHARED" -name '*.tmpl' -type f)

# 3. Generate project .claude/settings.json with selected plugins
mkdir -p .claude
{
  echo '{'
  echo '  "env": {'
  echo "    \"OTEL_RESOURCE_ATTRIBUTES\": \"project=${WORKLOAD}\""
  echo '  },'
  echo '  "worktree": {'
  echo '    "symlinkDirectories": ["node_modules"]'
  echo '  },'
  if [ ${#PLUGINS[@]} -gt 0 ]; then
    echo '  "enabledPlugins": {'
    for i in "${!PLUGINS[@]}"; do
      sep=','
      [ "$i" -eq "$((${#PLUGINS[@]} - 1))" ] && sep=''
      echo "    \"${PLUGINS[$i]}\": true${sep}"
    done
    echo '  },'
  fi
  echo '  "cleanupPeriodDays": 7'
  echo '}'
} > .claude/settings.json

# 4. Init git on the staging branch (janus default), initial commit
git init -q -b staging
git add -A
git -c user.name="$AUTHOR" -c user.email="$AUTHOR_EMAIL" commit -q -m "chore: initial scaffold from janus v${JANUS_VERSION}

Archetype: ${ARCHETYPE}
" || true

# ─── Post-scaffold checklist ─────────────────────────────────────────────
cat <<EOF

═══════════════════════════════════════════════
  Scaffolded ${WORKLOAD} (${ARCHETYPE})
═══════════════════════════════════════════════

Location: ${TARGET_DIR}

Next steps:

  1. cd ${TARGET_DIR}

  2. Review and complete:
     - .env.example (define every var the project needs)
     - AGENTS.md (fill in archetype-specific Critical Context)
     - infra/main.bicep (if Azure-deploying — composing from AVM)
     - src/ (archetype-specific scaffold is currently TODO; fill in by hand
       referring to docs/ in this project + janus's docs/conventions/)

  3. Create the GitHub repo:
       gh repo create ${GITHUB_ORG}/${WORKLOAD} --private --source=. --push

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
       - AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID (per env)
EOF
