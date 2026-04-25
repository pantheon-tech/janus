#!/usr/bin/env bash
# Build infra/main.bicep and run a what-if against the target RG.
#
# Usage: ./validate.sh [env]   (default: staging)
set -euo pipefail

ENV="${1:-staging}"

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

PARAM_FILE="infra/parameters.${ENV}.bicepparam"
if [ ! -f "$PARAM_FILE" ]; then
  echo "Error: $PARAM_FILE not found." >&2
  exit 1
fi

echo "Building infra/main.bicep..."
az bicep build --file infra/main.bicep

RG_NAME="rg-${WORKLOAD}-${ENV}"
echo "Running what-if for $RG_NAME..."

if ! az deployment group what-if \
    --resource-group "$RG_NAME" \
    --template-file infra/main.bicep \
    --parameters "$PARAM_FILE"; then
  echo "what-if failed. Ensure resource group '$RG_NAME' exists and you have access." >&2
  exit 1
fi
