#!/usr/bin/env bash
# Poll the deployed app's /health endpoint with retry.
#
# Usage: ./health-check.sh <env>
#
# The endpoint URL is archetype-specific; this default targets a
# Container App named ca-<workload>-api-<env>. Edit `ENDPOINT` for
# Functions / Static Web App archetypes.
set -euo pipefail

ENV="${1:-}"
if [ -z "$ENV" ]; then
  echo "Usage: $0 <env>" >&2
  exit 1
fi

if [ ! -f package.json ]; then
  echo "Error: package.json not found in cwd." >&2
  exit 1
fi

# Strip npm scope (@org/foo -> foo) since workload slugs cannot contain '/'
WORKLOAD=$(node -p "require('./package.json').name.replace(/^@[^/]+\//, '')" 2>/dev/null \
  || jq -r '.name | sub("^@[^/]+/"; "")' package.json)

if [ -z "$WORKLOAD" ] || [ "$WORKLOAD" = "null" ]; then
  echo "Error: could not determine workload from package.json name." >&2
  exit 1
fi

# Default endpoint for Container App archetype.
# Override via $HEALTH_ENDPOINT env var for other archetypes.
ENDPOINT="${HEALTH_ENDPOINT:-https://ca-${WORKLOAD}-api-${ENV}.azurecontainerapps.io/health}"

MAX_ATTEMPTS="${HEALTH_MAX_ATTEMPTS:-12}"
DELAY="${HEALTH_RETRY_DELAY:-10}"

echo "Health-checking $ENDPOINT (max $MAX_ATTEMPTS attempts, ${DELAY}s delay)"

for i in $(seq 1 "$MAX_ATTEMPTS"); do
  STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 "$ENDPOINT" || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "OK: $ENDPOINT returned 200 on attempt $i"
    exit 0
  fi
  echo "Attempt $i/$MAX_ATTEMPTS: $ENDPOINT returned $STATUS — retrying in ${DELAY}s"
  sleep "$DELAY"
done

echo "Health check failed after $MAX_ATTEMPTS attempts" >&2
exit 1
