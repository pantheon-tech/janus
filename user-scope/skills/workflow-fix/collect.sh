#!/usr/bin/env bash
# workflow-fix collector — find recently-failing workflow runs and pull failed-step logs.
# Usage: collect.sh [env1,env2,...]   (no arg = all branches/workflows)
# Env vars: LIMIT (default 50)  LOG_TAIL_LINES (default 200)
# Emits a JSON array on stdout, one entry per failing workflow's most-recent run.

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

ENVS_ARG="${1:-}"
LIMIT="${LIMIT:-50}"
LOG_TAIL_LINES="${LOG_TAIL_LINES:-200}"

# Map env tokens to branches (deploy workflows trigger off branch pushes).
env_to_branch() {
  case "$1" in
    dev|Dev|DEV)               echo dev ;;
    staging|Staging|STAGING)   echo staging ;;
    prod|production|Prod|PROD) echo main ;;
    *)                         echo "$1" ;;
  esac
}

BRANCH_FILTER_JSON="[]"
if [[ -n "$ENVS_ARG" ]]; then
  IFS=',' read -ra envs <<<"$ENVS_ARG"
  branches=()
  for e in "${envs[@]}"; do
    branches+=("$(env_to_branch "$e")")
  done
  BRANCH_FILTER_JSON=$(printf '%s\n' "${branches[@]}" | jq -R . | jq -s .)
fi

# Fetch a window of recent runs (across all workflows).
raw=$(gh run list --limit "$LIMIT" \
  --json databaseId,workflowName,name,displayTitle,headBranch,event,createdAt,updatedAt,url,conclusion,status,headSha,actor 2>/dev/null \
  || echo "[]")

# Take the latest run for each workflow name (so a workflow that failed yesterday but succeeded
# today is NOT flagged), then keep only failure-class outcomes.  Apply optional branch filter.
failed=$(echo "$raw" | jq --argjson b "$BRANCH_FILTER_JSON" '
  group_by(.workflowName // .name)
  | map(sort_by(.createdAt) | last)
  | map(select(.conclusion == "failure"
             or .conclusion == "cancelled"
             or .conclusion == "timed_out"
             or .conclusion == "startup_failure"))
  | (if ($b | length) > 0
       then map(select(.headBranch as $hb | $b | index($hb)))
       else .
     end)
')

# For each failed run, pull failed-job structure + tail of failed-step logs.
enriched=$(echo "$failed" | jq -c '.[]' | while read -r run; do
  id=$(echo "$run" | jq -r .databaseId)
  jobs=$(gh run view "$id" --json jobs 2>/dev/null \
    | jq '.jobs
          | map({
              name,
              conclusion,
              url,
              failed_steps: (.steps // [] | map(select(.conclusion == "failure" or .conclusion == "cancelled")) | map({number, name, conclusion}))
            })
          | map(select(.conclusion == "failure" or .conclusion == "cancelled" or (.failed_steps | length) > 0))' \
    || echo '[]')
  log=$(gh run view "$id" --log-failed 2>/dev/null | tail -n "$LOG_TAIL_LINES" | sed 's/\x1b\[[0-9;]*m//g' || echo "")
  jq -n --argjson r "$run" --argjson j "$jobs" --arg log "$log" \
        '$r + {failed_jobs: $j, failed_log_tail: $log}'
done | jq -s '.')

jq -n \
  --arg envs "$ENVS_ARG" \
  --argjson failures "$enriched" \
  '{ envs_requested: $envs, count: ($failures | length), failures: $failures }'
