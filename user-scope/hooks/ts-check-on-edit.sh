#!/bin/bash
# Post-edit TypeScript check.
# Runs `tsc --noEmit` scoped to the package containing the edited file.
# Skips node_modules/dist/build paths and non-TS edits.
#
# Wired in ~/.claude/settings.json as a PostToolUse hook with
# matcher "Edit|Write|MultiEdit".

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# No file path → nothing to check
[ -z "$FILE_PATH" ] && exit 0

# Only check .ts/.tsx files
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Skip vendored / generated paths
case "$FILE_PATH" in
  */node_modules/*|*/dist/*|*/build/*|*/.next/*|*/.vite/*|*/out/*|*.d.ts) exit 0 ;;
esac

# Find nearest tsconfig.json walking up from the edited file
DIR=$(dirname "$FILE_PATH")
while [ "$DIR" != "/" ] && [ "$DIR" != "." ]; do
  if [ -f "$DIR/tsconfig.json" ]; then
    # Run tsc with a 30s timeout. Limit output. Non-blocking on failure
    # (this is advisory — don't break the agent's flow on type errors).
    cd "$DIR"
    # --incremental reuses .tsbuildinfo cache between runs, dramatically
    # reducing latency on large monorepos after the first invocation.
    OUTPUT=$(timeout 30 npx --no-install tsc --noEmit --pretty --incremental 2>&1 || true)
    if [ -n "$OUTPUT" ] && echo "$OUTPUT" | grep -qE "error TS[0-9]+:"; then
      # Only emit when there are actual TS errors, capped to 25 lines
      echo "TypeScript errors after editing $FILE_PATH:"
      echo "$OUTPUT" | head -25
    fi
    exit 0
  fi
  DIR=$(dirname "$DIR")
done

# No tsconfig found — non-TS project, exit silently
exit 0
