---
title: Security Review — janus template kit
reviewer: Claude Code (automated)
date: 2026-04-25
scope: templates/, scripts/scaffold.sh, .github/workflows/
status: complete
---

# Security Review: janus Starter Kit

## Summary

janus is in good shape overall. The architecture makes sound security choices: OIDC over long-lived credentials, managed identity throughout, RBAC-mode Key Vault, gitleaks pre-commit, SHA-pinned third-party actions, no real credentials in example files, and a well-structured gitignore. Six findings are documented below. The most significant is a mismatch between the `our-keyvault.bicep` template and the explicit `defaultAction: Deny` policy stated in `docs/conventions/security.md`. A secondary risk is the prod OIDC service principal trusting the broad `pull_request` federated credential subject. The remaining findings are medium or low severity.

---

## Findings by Category

### 1. Secrets Exposure

**No committed credentials or tokens found.**

All `.env.example` files use empty values or clearly non-functional placeholders:
- `AZURE_SUBSCRIPTION_ID=`, `AZURE_TENANT_ID=`, `AZURE_CLIENT_ID=` — empty, no values.
- `COSMOS_KEY=` is annotated "local dev only; prod uses managed identity" — correct posture.
- `APPLICATIONINSIGHTS_CONNECTION_STRING=` — empty.
- `local.settings.json.example` contains only `"UseDevelopmentStorage=true"` — the standard Azure storage emulator constant, not a real connection string.

The two GUIDs in Bicep modules (`7f951dda-...` in `our-registry.bicep`, `4633458b-...` in `our-keyvault.bicep`) are public Azure built-in role definition IDs (AcrPull, Key Vault Secrets User respectively). They are intentional and non-sensitive.

No hardcoded Azure subscription IDs, tenant IDs, or client IDs appear anywhere in the template tree.

---

### 2. Workflow Safety

#### FINDING W-1: `anthropics/claude-code-action` not SHA-pinned (informational)

**Files:** `claude.yml.tmpl`, `claude-code-review.yml.tmpl`, `issue-triage.yml.tmpl`

All three use `anthropics/claude-code-action@v1` (tag, not commit SHA). The comment in `claude-code-review.yml.tmpl` explains why:

> OIDC: do NOT SHA-pin claude-code-action — its OIDC validation requires the workflow file to match the default branch. SHA-pin breaks token exchange (401) on every PR.

This is a known upstream constraint. The trade-off is documented inline. **No remediation needed** unless Anthropic resolves the OIDC issue — at which point SHA-pinning should be added. All other third-party actions are correctly SHA-pinned with version comments.

#### FINDING W-2: `Bash(gh *)` in `.claude/settings.json` is over-broad (P2)

**File:** `scripts/scaffold.sh` lines 324–330

The generated `.claude/settings.json` allows:

```json
"Bash(gh *)"
```

This pattern matches every `gh` subcommand including:
- `gh auth token` — prints the current OAuth token to stdout
- `gh secret set / list` — can read or write repository/org secrets
- `gh ssh-key add` — can register SSH keys on the account
- `gh repo delete` — can delete repositories

Combined with `Read(**)` (which reads every file in the project including `.env.local` if it exists), this is a meaningful over-permission for an AI agent with tool-use. The stated intent is clearly CI and code navigation (`gh issue`, `gh pr`, `gh api`, `gh search`, `gh label`).

Also absent from the deny list (referenced in task brief):
- No deny on reading `~/.ssh/**`, `~/.aws/**`, or `.env*` paths
- No deny on `Bash(curl * | bash)` or `Bash(wget * | bash)` patterns

**Recommended fix:** Replace `"Bash(gh *)"` with explicit allow entries matching the claude.yml `claude_args` pattern used in the workflow templates:

```json
"Bash(gh issue:*)",
"Bash(gh pr:*)",
"Bash(gh api:*)",
"Bash(gh search:*)",
"Bash(gh label:*)",
"Bash(gh run:*)"
```

Add deny entries for sensitive paths:

```json
"Bash(cat ~/.ssh/*)",
"Bash(cat ~/.aws/*)",
"Read(~/.ssh/**)",
"Read(~/.aws/**)"
```

The `rm -rf *` deny is in place but note: verify whether Claude Code's permission matcher treats `*` as a suffix wildcard or a full-argument wildcard. If `Bash(rm -rf *)` only matches when `-rf` is immediately followed by a single `*` literal argument, the deny may not catch `rm -rf -- foo` or `rm -rfv /tmp`.

#### FINDING W-3: Heredoc EOF-break in `claude-autofix.yml.tmpl` (P3)

**File:** `templates/_shared/.github/workflows/claude-autofix.yml.tmpl` lines 90–101

The CI log output (captured from `gh run view --log-failed`) is interpolated directly into a `cat <<EOF` block:

```yaml
run: |
  BODY=$(cat <<EOF
  ...
  $LOG
  ...
  EOF
  )
```

If the captured log contains the literal string `EOF` on its own at the start of a line (with the indentation level matching the delimiter), the shell heredoc terminates early and the remainder of the block is executed as shell commands. The YAML indentation adds leading spaces to the runtime content, but GitHub Actions strips leading whitespace from `run:` blocks during expansion, making the exact column of the heredoc delimiter environment-dependent.

The scenario requires attacker-controlled content in a CI log (e.g., a test that prints `EOF`), which is low likelihood. The shell would then attempt to execute the residual BODY content, which is markdown text — effectively a no-op in most cases. But the pattern is fragile.

**Recommended fix:** Use a random sentinel and quote it to prevent variable expansion inside the heredoc:

```bash
LOG_SENTINEL="LOG_BODY_$$_$(date +%s)"
BODY=$(cat <<${LOG_SENTINEL}
...
${LOG}
...
${LOG_SENTINEL}
)
```

Or capture the LOG into a temp file and pass it to `gh issue create --body-file`.

#### No `pull_request_target` triggers found.

All workflows use `pull_request` (safe) or `push` (safe). No `pull_request_target` usage anywhere. Confirmed across all template workflows and janus's own `.github/workflows/janus-ci.yml`.

#### `github.ref_name` interpolation in `deploy.yml.tmpl` (informational)

The deploy workflow interpolates `${{ github.ref_name }}` directly into a shell `case` statement (line 30). For `push` triggers, `github.ref_name` is set by GitHub from the actual branch name, not from user input, so this is not exploitable. The case statement also rejects any value other than `main` or `staging` with `exit 1`. No action required.

---

### 3. CI/CD Pipeline Integrity

The branch model (staging → main), concurrency groups, deploy-only-on-push design, and release-please-on-prod-success patterns are all implemented correctly.

#### FINDING P-1: OIDC `pull_request` subject on the prod service principal (P1)

**File:** `templates/_shared/infra/scripts/setup-oidc.sh` lines 72–86

`setup-oidc.sh` creates a `pull_request` federated credential on **both** the staging and the prod service principals. Both SPs are then granted **Contributor** on their respective resource groups (line 96). The Contributor role is not read-only: it can create, modify, and delete any resource in the RG except manage role assignments.

The intent documented in `docs/conventions/secrets.md` is:

> The `pull_request` subject grants no environment access; it must be paired with read-only-by-default permissions in the calling workflow.

This documented guidance is internally inconsistent: the `pull_request` subject **is** paired with Contributor on the prod RG, not with read-only permissions. `infra-preview.yml.tmpl` (the intended consumer) runs `az deployment group what-if` which is effectively read-only, but the **trust boundary itself** is Contributor on prod — not the what-if command that happens to be in the template today.

**Exploitability:** A contributor with PR-create rights in the repo can open a PR targeting `staging` or `main`, triggering `infra-preview.yml`. If the `prod` GitHub Environment has no protection rules configured (required-reviewer gate), the workflow obtains prod OIDC credentials automatically. The checked-out `./infra/deploy.sh` (from the PR branch, not main) is not called by `infra-preview`, but the az CLI is authenticated as Contributor. An attacker who modifies `infra-preview.yml.tmpl` in a PR would need to get that change merged first, so the primary risk is the protection-rules gap, not RCE.

**Recommended fix (two parts):**
1. Remove the `pull_request` federated credential from the **prod** service principal in `setup-oidc.sh`. Only the staging SP needs it for what-if previews on PRs.
2. Add a comment in `setup-oidc.sh` stating this explicitly, and note in `docs/conventions/secrets.md` that the `pull_request` subject should be on the staging SP only.

#### Container image build/push gap (informational)

`deploy.yml.tmpl` runs `pnpm build` and then `./infra/deploy.sh`, which calls `az deployment group create`. It does **not** build or push a container image to ACR. The Bicep `our-container-app.bicep` defaults to `mcr.microsoft.com/k8se/quickstart:latest` as the image. Scaffolded projects using the `backend-container-app` archetype will need to wire up `docker buildx build && docker push` steps before the Bicep deploy step. This is not a security issue but is a functional gap that the next-steps checklist in `scaffold.sh` does not call out.

---

### 4. `.claude/settings.json` Permissions

See FINDING W-2 above for the primary concern (`Bash(gh *)`). The allow list is otherwise reasonable: pnpm, tsc, git read-only commands, Read, Grep, and scoped WebFetch. The deny list correctly blocks `rm -rf`, `sudo`, force-push, direct-to-main push, and publish commands.

Missing from the deny list:
- `Read(~/.ssh/**)` and `Read(~/.aws/**)` — sensitive user-level credential paths.
- Direct `.env*` read denies (Claude Code's `Read(**)` allow covers them). Mitigated in practice by the project gitignore which prevents `.env.local` from being committed, but the agent can still read them from the filesystem.
- Dangerous pipe patterns: `Bash(curl * | bash)`, `Bash(wget * -O - | bash)`.

---

### 5. lefthook + gitleaks

The `lefthook.yml` template in `templates/_shared/` is correct and strict:

```yaml
gitleaks:
  run: |
    if command -v gitleaks >/dev/null 2>&1; then
      gitleaks protect --staged --redact --verbose
    else
      echo "gitleaks not installed — ..."
      exit 1
    fi
```

`exit 1` when gitleaks is absent is the right choice — as the comment says, silently skipping is the failure mode that leaks credentials. The hook correctly uses `--staged` (only staged files) and `--redact` (hides values in output). No bypass paths are visible. The hook is enforced at pre-commit stage with `parallel: true` alongside biome and typecheck, meaning a commit with a gitleaks failure will be rejected.

The janus root's own `lefthook.yml` mirrors the template (verified by the `parity` CI job).

---

### 6. Bicep / Infra Security

#### FINDING B-1: Key Vault uses `defaultAction: Allow` in all environments, contradicting documented policy (P1)

**File:** `templates/_shared/infra/modules/our-keyvault.bicep` lines 50–53

```bicep
publicNetworkAccess: 'Enabled'
networkAcls: {
  defaultAction: 'Allow'
  bypass: 'AzureServices'
}
```

`docs/conventions/security.md` explicitly states:

> Key Vault, Storage, Cosmos in prod: `defaultAction: Deny` + private endpoint. The `AzureServices` bypass does not cover Container Apps.

The Bicep template has no environment-conditional on network access. Every scaffolded project that uses this module ships prod Key Vault with public internet access and `defaultAction: Allow`. The docs note that `AzureServices` bypass does not help Container Apps (they need a private endpoint), so even the bypass is misleading.

The same open-network pattern appears in `our-registry.bicep` (line 46: `publicNetworkAccess: 'Enabled'`) and `our-static-site.bicep` (line 47: `publicNetworkAccess: 'Enabled'`). Static Web Apps are intentionally public, so SWA is fine. ACR with public access is a lower risk but inconsistent with the "default-deny network" principle.

**Recommended fix:** Add environment-conditional network hardening in `our-keyvault.bicep`:

```bicep
publicNetworkAccess: env == 'prod' ? 'Disabled' : 'Enabled'
networkAcls: env == 'prod' ? {
  defaultAction: 'Deny'
  bypass: 'None'
  virtualNetworkRules: []
  ipRules: []
} : {
  defaultAction: 'Allow'
  bypass: 'AzureServices'
}
```

Add a `// NOTE: prod requires private endpoint for Container Apps to reach KV` comment. Consider the same pattern for `our-registry.bicep` in prod (Premium SKU, so private link is available).

#### Positive findings:

- ACR admin user correctly disabled (`acrAdminUserEnabled: false`) — good.
- Container App uses managed identity for ACR pull (no credentials) — correct.
- Container App sets `ingressAllowInsecure: false` — HTTPS enforced.
- Key Vault uses `enableRbacAuthorization: true` (no vault access policies) — correct.
- Key Vault `enableSoftDelete: true`, `softDeleteRetentionInDays: 90` — correct.
- `enablePurgeProtection` is conditional on prod: `bool = (env == 'prod')` — correct.
- Function App: `httpsOnly: true`, `minTlsVersion: '1.2'`, `ftpsState: 'Disabled'` — all correct.
- Function App uses managed identity for storage (`storageAccountUseIdentityAuthentication: true`) — correct.
- Monitoring module uses workspace-linked Application Insights — correct.

---

### 7. Scaffold Script Safety (`scripts/scaffold.sh`)

**No `eval` usage found.**

**No writes outside `TARGET_DIR`.** The script `cd "$TARGET_DIR"` after creating it and uses absolute paths for all reads from `JANUS_ROOT`. The conventions docs copy (`cp -R "${JANUS_ROOT}/docs/conventions/." docs/conventions/`) is relative to the already-`cd`'d `TARGET_DIR`. Safe.

**WORKLOAD is validated** with a strict regex (`^[a-z][a-z0-9]{2,11}$`) before use. This prevents path traversal via the slug.

**`TARGET_DIR` is properly quoted** in all uses (`mkdir -p "$TARGET_DIR"`, `cd "$TARGET_DIR"`, etc.). Paths with spaces would be handled correctly.

**Unvalidated free-text inputs (P3):**

`DESCRIPTION`, `AUTHOR`, `AUTHOR_EMAIL`, `GITHUB_ORG`, `LICENSE`, and `REGION` are accepted without validation. These are passed to:
1. `mo` template rendering (Mustache substitution) — safe, no command execution.
2. `git -c user.name="$AUTHOR" -c user.email="$AUTHOR_EMAIL" commit ...` — safe, values are double-quoted arguments to `-c`.
3. `jq -n --arg workload "$WORKLOAD"` — only WORKLOAD goes to jq; others go through mo.

An AUTHOR containing shell metacharacters (e.g., backticks, `$(...)`) would not be evaluated because all uses are quoted. An AUTHOR_EMAIL containing `"` could potentially break the `git -c user.email="..."` quoting, but git's `-c` argument parsing is robust against this in practice. No code injection risk identified, though input validation would be belt-and-braces good practice.

**`JANUS_VERSION` extracted from package.json** using `awk -F'"'` without path validation — safe for the local tool, not exposed to user input.

**ACTIONS_PAT requires `repo` scope** (documented in `claude-autofix.yml.tmpl` comments). This is broad. For the specific use case (triggering issue-created events for claude.yml downstream), a fine-grained PAT with `issues: write` would suffice. The `repo` scope also includes `contents: write`, `pull-requests: write`, and `actions: read/write`. This is a process concern, not a template defect, but worth noting in onboarding docs.

---

### 8. Known-Issue Follow-Up: Hardcoded `'mcp-server'` name

**File:** `templates/mcp-server/src/index.ts` line 15

```typescript
const server = new McpServer({
  name: 'mcp-server',
  version: '0.0.0',
});
```

The MCP server name is hardcoded as the string `'mcp-server'` rather than substituted from the `workload` slot. This is **not a security issue**. The MCP server name is an internal identifier used for stdio transport negotiation between the MCP host and this process — it is never exposed over the network, does not affect authentication, and does not appear in logs visible to external parties. The version `'0.0.0'` would also ideally be populated from `package.json` at runtime, but that is a functional polish issue, not a security concern.

---

## Severity Table

| ID | Finding | Severity | Category |
|----|---------|----------|----------|
| P-1 | OIDC `pull_request` subject on prod SP (Contributor on prod RG) | **P1 high** | OIDC / CI |
| B-1 | Key Vault `defaultAction: Allow` in prod, contradicts security.md | **P1 high** | Bicep |
| W-2 | `Bash(gh *)` over-broad in `.claude/settings.json`; missing deny paths | **P2 medium** | Claude permissions |
| W-3 | Heredoc EOF-break via untrusted CI log in `claude-autofix.yml.tmpl` | **P3 low** | Workflow |
| — | ACTIONS_PAT requires `repo` scope (could use fine-grained PAT) | **P3 low** | Process |
| — | Unvalidated free-text inputs in `scaffold.sh` (AUTHOR, DESCRIPTION, etc.) | **P3 low** | Script |
| W-1 | `claude-code-action@v1` not SHA-pinned (upstream constraint documented) | Informational | Workflow |
| — | Deploy workflow has no container build/push step (functional gap) | Informational | CI/CD |
| — | MCP server `name: 'mcp-server'` not slot-substituted (internal name only) | Informational | Template |

**P0 blockers: 0 | P1 high: 2 | P2 medium: 1 | P3 low: 3 | Informational: 3**

---

## Recommended Fixes (Prioritised)

### P1 — Fix immediately before shipping to teams

**B-1:** Add env-conditional network hardening to `our-keyvault.bicep`:

```bicep
publicNetworkAccess: env == 'prod' ? 'Disabled' : 'Enabled'
networkAcls: env == 'prod' ? {
  defaultAction: 'Deny'
  bypass: 'None'
  virtualNetworkRules: []
  ipRules: []
} : {
  defaultAction: 'Allow'
  bypass: 'AzureServices'
}
```

Add a matching comment that Container Apps require a private endpoint to reach a Deny-mode Key Vault.

**P-1:** In `setup-oidc.sh`, remove the `pull_request` federated credential from the **prod** loop iteration. Only the staging SP needs it. Add an explanatory comment, and update `docs/conventions/secrets.md` to make explicit that `pull_request` → staging SP only:

```bash
# Federated credential 2: pull_request previews (staging only — not prod)
if [ "$ENV" = "staging" ]; then
  # ... create CRED_PR_NAME credential
fi
```

### P2 — Fix before first scaffolded-project goes to production

**W-2:** In `scripts/scaffold.sh`, replace `"Bash(gh *)"` with scoped entries:

```json
"Bash(gh issue:*)",
"Bash(gh pr:*)",
"Bash(gh api:*)",
"Bash(gh search:*)",
"Bash(gh label:*)",
"Bash(gh run:*)"
```

Add to deny list:

```json
"Bash(cat ~/.ssh/*)",
"Bash(cat ~/.aws/*)",
"Read(~/.ssh/**)",
"Read(~/.aws/**)",
"Bash(curl * | bash)",
"Bash(wget * | bash)"
```

### P3 — Fix when convenient

**W-3:** In `claude-autofix.yml.tmpl`, replace the `cat <<EOF` block with a temp-file approach:

```bash
TMPBODY=$(mktemp)
cat > "$TMPBODY" <<'ENDOFBODY'
@claude CI failed on PR #${PR_NUMBER}. ...
ENDOFBODY
# ...
gh issue create --title "..." --body-file "$TMPBODY"
rm -f "$TMPBODY"
```

Or use `printf '%s' "$BODY"` piped to `gh issue create --body -` to avoid the heredoc entirely.

**ACTIONS_PAT scope:** Document in `docs/conventions/secrets.md` that a fine-grained PAT scoped to `issues: write` (plus `pull-requests: write` for cross-workflow triggers) is preferred over the classic `repo`-scoped PAT. Update the scaffold checklist note.

**Scaffold input validation:** Add lightweight validation for GITHUB_ORG (e.g., `^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$`) and AUTHOR_EMAIL (basic `@` check) in `scaffold.sh`.
