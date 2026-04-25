#!/usr/bin/env bash
# Set up GitHub Actions OIDC federation for Azure deployments.
#
# Creates per-environment Azure AD app registrations + service principals,
# adds federated credentials for `environment:<env>` and `pull_request`,
# and grants Contributor on the per-env resource group.
#
# Usage: ./setup-oidc.sh <workload> <github-org> <github-repo>
#
# Prereqs:
#   - az CLI logged in (`az login`) with privilege to create app registrations
#     and assign roles (Owner or User Access Administrator on the subscription).
#   - Resource groups rg-<workload>-staging and rg-<workload>-prod must exist.
#
# Output: prints AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID per env
# for you to paste into GitHub Environment secrets.
set -euo pipefail

WORKLOAD="${1:-}"
GITHUB_ORG="${2:-}"
GITHUB_REPO="${3:-}"

if [ -z "$WORKLOAD" ] || [ -z "$GITHUB_ORG" ] || [ -z "$GITHUB_REPO" ]; then
  echo "Usage: $0 <workload> <github-org> <github-repo>" >&2
  exit 1
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Error: az CLI not found in PATH." >&2
  exit 1
fi

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)

echo "Subscription: $SUBSCRIPTION_ID"
echo "Tenant:       $TENANT_ID"
echo

for ENV in staging prod; do
  echo "=== Setting up OIDC for env: $ENV ==="

  APP_NAME="github-oidc-${WORKLOAD}-${ENV}"
  RG_NAME="rg-${WORKLOAD}-${ENV}"

  # Create app registration if not exists
  CLIENT_ID=$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv 2>/dev/null || true)
  if [ -z "$CLIENT_ID" ]; then
    echo "  Creating app registration: $APP_NAME"
    CLIENT_ID=$(az ad app create --display-name "$APP_NAME" --query 'appId' -o tsv)
    az ad sp create --id "$CLIENT_ID" >/dev/null
  else
    echo "  App registration exists: $APP_NAME ($CLIENT_ID)"
  fi

  # Federated credential 1: environment-scoped pushes
  CRED_ENV_NAME="${APP_NAME}-environment"
  if ! az ad app federated-credential list --id "$CLIENT_ID" --query "[?name=='${CRED_ENV_NAME}'] | [0].name" -o tsv 2>/dev/null | grep -q .; then
    echo "  Creating federated credential: $CRED_ENV_NAME"
    az ad app federated-credential create --id "$CLIENT_ID" --parameters @- <<EOF >/dev/null
{
  "name": "${CRED_ENV_NAME}",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${GITHUB_ORG}/${GITHUB_REPO}:environment:${ENV}",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
  else
    echo "  Federated credential exists: $CRED_ENV_NAME"
  fi

  # Federated credential 2: pull_request previews (staging only — NOT prod).
  # The prod SP must only trust the environment:prod subject. Adding pull_request
  # here would grant any PR-opener Contributor access on the prod resource group,
  # which is a significant privilege escalation risk.
  if [ "$ENV" = "staging" ]; then
    CRED_PR_NAME="${APP_NAME}-pr"
    if ! az ad app federated-credential list --id "$CLIENT_ID" --query "[?name=='${CRED_PR_NAME}'] | [0].name" -o tsv 2>/dev/null | grep -q .; then
      echo "  Creating federated credential: $CRED_PR_NAME"
      az ad app federated-credential create --id "$CLIENT_ID" --parameters @- <<EOF >/dev/null
{
  "name": "${CRED_PR_NAME}",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:${GITHUB_ORG}/${GITHUB_REPO}:pull_request",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF
    else
      echo "  Federated credential exists: $CRED_PR_NAME"
    fi
  else
    echo "  Skipping pull_request federated credential for $ENV (prod SP trusts environment:prod only)"
  fi

  # Role assignment: Contributor on the per-env RG
  SP_OBJECT_ID=$(az ad sp show --id "$CLIENT_ID" --query id -o tsv)
  SCOPE="/subscriptions/${SUBSCRIPTION_ID}/resourceGroups/${RG_NAME}"

  if az role assignment list --assignee-object-id "$SP_OBJECT_ID" --scope "$SCOPE" --query '[0].id' -o tsv 2>/dev/null | grep -q .; then
    echo "  Role assignment already exists on $SCOPE"
  else
    echo "  Granting Contributor on $SCOPE"
    az role assignment create \
      --role Contributor \
      --assignee-object-id "$SP_OBJECT_ID" \
      --assignee-principal-type ServicePrincipal \
      --scope "$SCOPE" \
      --output none \
      || echo "  WARN: role assignment failed — does the resource group exist? Create it first with:"
    echo "        az group create -n $RG_NAME -l australiaeast"
  fi

  echo
  echo "  GitHub environment secrets for '$ENV':"
  echo "    AZURE_CLIENT_ID:       $CLIENT_ID"
  echo "    AZURE_TENANT_ID:       $TENANT_ID"
  echo "    AZURE_SUBSCRIPTION_ID: $SUBSCRIPTION_ID"
  echo
done

echo "Done. Configure GitHub Environment secrets:"
echo "  https://github.com/${GITHUB_ORG}/${GITHUB_REPO}/settings/environments"
