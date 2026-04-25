#!/usr/bin/env bash
# Deploy infra/main.bicep to the target environment.
#
# Usage: ./deploy.sh <env>
#
# Called by .github/workflows/deploy.yml after Azure login. Assumes the
# resource group rg-<workload>-<env> already exists and the active principal
# has Contributor on it.
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

WORKLOAD=$(node -p "require('./package.json').name.replace(/^@[^/]+\//, '')" 2>/dev/null \
  || jq -r '.name | sub("^@[^/]+/"; "")' package.json)

if [ -z "$WORKLOAD" ] || [ "$WORKLOAD" = "null" ]; then
  echo "Error: could not determine workload from package.json name." >&2
  exit 1
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Error: az CLI not found in PATH." >&2
  exit 1
fi

RG_NAME="rg-${WORKLOAD}-${ENV}"
PARAM_FILE="infra/parameters.${ENV}.bicepparam"

if [ ! -f "$PARAM_FILE" ]; then
  echo "Error: $PARAM_FILE not found." >&2
  exit 1
fi

echo "Deploying $WORKLOAD to $ENV (RG: $RG_NAME)..."

az deployment group create \
  --resource-group "$RG_NAME" \
  --template-file infra/main.bicep \
  --parameters "$PARAM_FILE" \
  --output table

echo "Deploy complete."
