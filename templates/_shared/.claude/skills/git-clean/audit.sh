#!/bin/bash
# Git state audit — used by /git-clean skill.
# Outputs a JSON report of branches, worktrees, and cleanup candidates.
#
# The "working branch" defaults to `staging` (janus convention) but can
# be overridden by exporting BASE_BRANCH=<name> before invocation.
set -euo pipefail

PROJECT_DIR="${1:-$(git rev-parse --show-toplevel)}"
BASE="${BASE_BRANCH:-staging}"
cd "$PROJECT_DIR"

# Ensure fresh remote state
git fetch --prune origin 2>/dev/null || true

echo "{"

# --- Divergence ---
BASE_BEHIND=$(git rev-list --count "${BASE}..origin/${BASE}" 2>/dev/null || echo "0")
BASE_AHEAD=$(git rev-list --count "origin/${BASE}..${BASE}" 2>/dev/null || echo "0")
MAIN_BEHIND=$(git rev-list --count main..origin/main 2>/dev/null || echo "0")
echo "  \"divergence\": { \"base_branch\": \"${BASE}\", \"base_behind\": ${BASE_BEHIND}, \"base_ahead\": ${BASE_AHEAD}, \"main_behind\": ${MAIN_BEHIND} },"

# --- Merged branches (safe to delete) ---
echo "  \"merged_branches\": ["
FIRST=true
git branch --merged "origin/${BASE}" \
  | { grep -vE "^[* ]+(main|${BASE})$" || true; } \
  | sed 's/^[[:space:]]*//' \
  | while read -r branch; do
    [ -z "$branch" ] && continue
    $FIRST || echo ","
    FIRST=false
    printf '    "%s"' "$branch"
  done
echo ""
echo "  ],"

# --- Untracked branches (no remote) ---
echo "  \"untracked_branches\": ["
FIRST=true
git branch --format='%(refname:short) %(upstream:short)' | while read -r branch remote; do
  [ -z "$branch" ] && continue
  [[ "$branch" == "main" || "$branch" == "$BASE" ]] && continue
  if [ -z "$remote" ]; then
    $FIRST || echo ","
    FIRST=false
    printf '    "%s"' "$branch"
  fi
done
echo ""
echo "  ],"

# --- Worktrees ---
echo "  \"worktrees\": ["
FIRST=true
git worktree list --porcelain | while read -r line; do
  if [[ "$line" == worktree\ * ]]; then
    WT_PATH="${line#worktree }"
    [ "$WT_PATH" = "$PROJECT_DIR" ] && continue
    DIRTY="false"
    if [ -d "$WT_PATH" ]; then
      STATUS=$(git -C "$WT_PATH" status --porcelain 2>/dev/null | head -1)
      [ -n "$STATUS" ] && DIRTY="true"
    fi
    WT_BRANCH=$(git -C "$WT_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")
    $FIRST || echo ","
    FIRST=false
    printf '    {"path": "%s", "branch": "%s", "dirty": %s}' "$WT_PATH" "$WT_BRANCH" "$DIRTY"
  fi
done
echo ""
echo "  ],"

# --- Open PRs (branches we must NOT delete) ---
echo "  \"open_pr_branches\": ["
FIRST=true
gh pr list --state open --json headRefName --jq '.[].headRefName' 2>/dev/null | while read -r branch; do
  [ -z "$branch" ] && continue
  $FIRST || echo ","
  FIRST=false
  printf '    "%s"' "$branch"
done
echo ""
echo "  ],"

# --- Summary ---
TOTAL_LOCAL=$(git branch | wc -l | tr -d ' ')
TOTAL_REMOTE=$(git branch -r | wc -l | tr -d ' ')
TOTAL_WORKTREES=$(git worktree list | wc -l | tr -d ' ')
TOTAL_WORKTREES=$((TOTAL_WORKTREES - 1))
echo "  \"summary\": { \"local_branches\": ${TOTAL_LOCAL}, \"remote_branches\": ${TOTAL_REMOTE}, \"worktrees\": ${TOTAL_WORKTREES} }"

echo "}"
