#!/usr/bin/env bash
# Interactive Key Vault secret seeder.
#
# Reads variable names from .env.example, prompts for each value (silent),
# and writes them as KV secrets. Variable names are converted from
# UPPER_SNAKE_CASE to lower-kebab-case for KV naming compatibility.
#
# Usage: ./populate-secrets.sh <workload> [env]
#
# Prereqs:
#   - az CLI logged in
#   - Caller has the "Key Vault Secrets Officer" role on the vault
set -euo pipefail

WORKLOAD="${1:-}"
ENV="${2:-staging}"

if [ -z "$WORKLOAD" ]; then
  echo "Usage: $0 <workload> [env]" >&2
  exit 1
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Error: az CLI not found in PATH." >&2
  exit 1
fi

KV_NAME="kv-${WORKLOAD}-${ENV}"
ENV_EXAMPLE=".env.example"

if [ ! -f "$ENV_EXAMPLE" ]; then
  echo "Error: $ENV_EXAMPLE not found in cwd." >&2
  exit 1
fi

# Verify vault accessible
if ! az keyvault show --name "$KV_NAME" --query id -o tsv >/dev/null 2>&1; then
  echo "Error: Key Vault $KV_NAME not found or no access." >&2
  exit 1
fi

# Extract var names (lines like FOO=bar or FOO=)
VARS=$(grep -E '^[A-Z][A-Z0-9_]*=' "$ENV_EXAMPLE" | cut -d= -f1)

if [ -z "$VARS" ]; then
  echo "No environment variables found in $ENV_EXAMPLE." >&2
  exit 0
fi

echo "Populating secrets in $KV_NAME (from $ENV_EXAMPLE)"
echo "Press Enter with no value to skip a secret."
echo

WRITTEN=0
SKIPPED=0
for VAR in $VARS; do
  # FOO_BAR -> foo-bar
  SECRET_NAME=$(echo "$VAR" | tr '[:upper:]_' '[:lower:]-')

  printf "  %s: " "$VAR"
  read -r -s VALUE
  echo

  if [ -z "$VALUE" ]; then
    echo "    (skipped)"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  az keyvault secret set \
    --vault-name "$KV_NAME" \
    --name "$SECRET_NAME" \
    --value "$VALUE" \
    --output none

  echo "    -> wrote $SECRET_NAME"
  WRITTEN=$((WRITTEN + 1))
done

echo
echo "Wrote $WRITTEN secret(s); skipped $SKIPPED."
TOTAL=$(az keyvault secret list --vault-name "$KV_NAME" --query 'length(@)' -o tsv)
echo "$KV_NAME now has $TOTAL secret(s)."
