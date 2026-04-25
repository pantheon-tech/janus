#!/usr/bin/env bash
# setup-user-scope.sh — install janus user-scope to ~/.claude/
#
# Idempotent: safe to re-run. Default behaviour preserves any local edits
# (won't overwrite existing files unless --force).
#
# Usage:
#   bash scripts/setup-user-scope.sh                # interactive, won't overwrite
#   bash scripts/setup-user-scope.sh --force        # overwrite everything
#   bash scripts/setup-user-scope.sh --update       # update only files identical to a previous shipped version
#   bash scripts/setup-user-scope.sh --dry-run      # show what would change, don't write
#   bash scripts/setup-user-scope.sh --diff         # show diff against ~/.claude/, don't write
#   bash scripts/setup-user-scope.sh --target /tmp/test-home  # install to a different HOME (for testing)
set -euo pipefail

JANUS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="${JANUS_ROOT}/user-scope"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: user-scope/ not found in janus repo at ${JANUS_ROOT}" >&2
  exit 1
fi

# ─── Args ──────────────────────────────────────────────────────────────
FORCE=false
UPDATE=false
DRY_RUN=false
DIFF=false
TARGET_HOME="${HOME}"

while [ $# -gt 0 ]; do
  case "$1" in
    --force)   FORCE=true ;;
    --update)  UPDATE=true ;;
    --dry-run) DRY_RUN=true ;;
    --diff)    DIFF=true ;;
    --target)  TARGET_HOME="$2"; shift ;;
    --help|-h)
      head -16 "$0" | tail -14
      exit 0
      ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
  shift
done

TARGET_DIR="${TARGET_HOME}/.claude"

# ─── Preflight ─────────────────────────────────────────────────────────
for tool in jq sed; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Error: '$tool' is required but not installed." >&2
    exit 1
  }
done

# ─── Counters ──────────────────────────────────────────────────────────
INSTALLED=0
UPDATED=0
SKIPPED=0
DIFFERED=0

mkdir -p "${TARGET_DIR}/hooks" "${TARGET_DIR}/skills" "${TARGET_DIR}/rules"

# ─── Helper: install a file with overwrite policy ──────────────────────
install_file() {
  local src="$1" dest="$2" make_executable="${3:-false}"
  local action="install"

  if [ -f "$dest" ]; then
    if cmp -s "$src" "$dest"; then
      SKIPPED=$((SKIPPED + 1))
      return 0
    fi
    if "$DIFF"; then
      echo "--- ${dest#$TARGET_HOME/}"
      diff -u "$dest" "$src" || true
      DIFFERED=$((DIFFERED + 1))
      return 0
    fi
    if "$FORCE" || "$UPDATE"; then
      action="update"
    else
      echo "  [skip] ${dest#$TARGET_HOME/} (exists; --force to overwrite)"
      SKIPPED=$((SKIPPED + 1))
      return 0
    fi
  fi

  if "$DRY_RUN"; then
    echo "  [${action}] ${dest#$TARGET_HOME/}"
  else
    mkdir -p "$(dirname "$dest")"
    cp "$src" "$dest"
    "$make_executable" && chmod +x "$dest"
    if [ "$action" = "install" ]; then
      INSTALLED=$((INSTALLED + 1))
    else
      UPDATED=$((UPDATED + 1))
    fi
  fi
}

# ─── 1. Hooks ──────────────────────────────────────────────────────────
echo "Hooks:"
for h in "$SOURCE_DIR/hooks/"*.sh; do
  install_file "$h" "${TARGET_DIR}/hooks/$(basename "$h")" true
done

# ─── 2. Skills (recursive copy) ────────────────────────────────────────
echo "Skills:"
while IFS= read -r f; do
  rel="${f#$SOURCE_DIR/skills/}"
  install_file "$f" "${TARGET_DIR}/skills/${rel}" "$( [[ "$f" == *.sh || "$f" == *.py ]] && echo true || echo false )"
done < <(find "$SOURCE_DIR/skills" -type f)

# ─── 3. Rules ──────────────────────────────────────────────────────────
echo "Rules:"
for r in "$SOURCE_DIR/rules/"*.md; do
  install_file "$r" "${TARGET_DIR}/rules/$(basename "$r")"
done

# ─── 4. CLAUDE.md ──────────────────────────────────────────────────────
echo "CLAUDE.md:"
install_file "$SOURCE_DIR/CLAUDE.md" "${TARGET_DIR}/CLAUDE.md"

# ─── 5. settings.json — jq-merge so user edits are preserved ───────────
echo "settings.json:"
PARTIAL_RAW="$(cat "$SOURCE_DIR/settings.json.partial")"
# Substitute $HOME_PLACEHOLDER → actual TARGET_HOME for hook command paths.
PARTIAL_RENDERED="$(echo "$PARTIAL_RAW" | sed "s|\$HOME_PLACEHOLDER|${TARGET_HOME}|g")"

EXISTING_SETTINGS="${TARGET_DIR}/settings.json"
if "$DRY_RUN"; then
  if [ -f "$EXISTING_SETTINGS" ]; then
    echo "  [merge] ${EXISTING_SETTINGS#$TARGET_HOME/} (jq deep-merge with partial)"
  else
    echo "  [install] ${EXISTING_SETTINGS#$TARGET_HOME/}"
  fi
elif "$DIFF"; then
  if [ -f "$EXISTING_SETTINGS" ]; then
    MERGED="$(echo "$PARTIAL_RENDERED" | jq -s --slurpfile cur "$EXISTING_SETTINGS" '$cur[0] * .[0]')"
    echo "--- settings.json (after merge)"
    diff -u "$EXISTING_SETTINGS" <(echo "$MERGED") || true
    DIFFERED=$((DIFFERED + 1))
  else
    echo "  (no existing settings.json; would install partial)"
  fi
else
  if [ -f "$EXISTING_SETTINGS" ]; then
    BACKUP="${EXISTING_SETTINGS}.bak.$(date +%Y%m%d-%H%M%S)"
    cp "$EXISTING_SETTINGS" "$BACKUP"
    # Deep merge: existing wins on conflicts EXCEPT for these keys we always force
    # (they shouldn't already be there in conflicting form, but be safe).
    MERGED="$(echo "$PARTIAL_RENDERED" | jq -s --slurpfile cur "$EXISTING_SETTINGS" '$cur[0] * .[0]')"
    echo "$MERGED" > "$EXISTING_SETTINGS"
    UPDATED=$((UPDATED + 1))
    echo "  [merge] settings.json (backup: ${BACKUP#$TARGET_HOME/})"
  else
    echo "$PARTIAL_RENDERED" > "$EXISTING_SETTINGS"
    INSTALLED=$((INSTALLED + 1))
    echo "  [install] settings.json"
  fi
fi

# ─── Summary ───────────────────────────────────────────────────────────
echo
if "$DRY_RUN"; then
  echo "Dry run complete. Re-run without --dry-run to apply."
elif "$DIFF"; then
  echo "Diff complete. ${DIFFERED} file(s) differ."
else
  echo "Done. Installed: ${INSTALLED}, Updated: ${UPDATED}, Skipped: ${SKIPPED}."
  if [ "$SKIPPED" -gt 0 ] && ! "$FORCE" && ! "$UPDATE"; then
    echo "Re-run with --force to overwrite skipped files, or --diff to inspect differences."
  fi
fi
