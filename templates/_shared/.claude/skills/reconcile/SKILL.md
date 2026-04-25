---
name: reconcile
description: Use when memory or CLAUDE.md files may have drifted from reality — after major refactors, architecture changes, or when stale references are suspected. Checks for removed technologies, broken file paths, orphaned memory entries, and outdated descriptions.
argument-hint: "[focus-area] (optional: memory, claude-md, all)"
---

Reconcile documentation and memory against current codebase state.

Focus: $ARGUMENTS (default: all)

## What This Checks

### 1. Stale Technology References

Greps memory and CLAUDE.md files for terms referencing removed/replaced technologies. The list of stale terms is **project-specific** and lives in `.claude/reconcile.config` (one ERE pattern per line; comments allowed).

**Scan targets:**
- `~/.claude/projects/<project-key>/memory/*.md` — where `<project-key>` is the project path with `/` → `-` (e.g. `/home/alice/work/myproj` → `-home-alice-work-myproj`). The same hook directory the SessionEnd hook writes its breadcrumb to.
- All `CLAUDE.md` and `AGENTS.md` files in the repo (`find . -name CLAUDE.md -o -name AGENTS.md`, excluding `node_modules` and `.claude/worktrees`).

**Bootstrap:** if `.claude/reconcile.config` doesn't exist, copy `.claude/reconcile.config.example` and edit. An empty config is valid (just disables the stale-term check).

**Exceptions** (expected references — do NOT flag):
- Memory entries that document the removal itself (e.g. "Redis removed entirely" in a migration note)
- Files explicitly tagged "REMOVED", "replaced", "migrated from", "deprecated"
- Stub files documenting their own removal in the header

### 2. Broken File Path References

For each memory file, extract any file paths mentioned and verify they still exist:
```bash
grep -oE '/[A-Za-z][A-Za-z0-9_./-]+|[A-Za-z]+/src/[^ ]+' "$file"
```
Report paths that no longer exist on disk.

### 3. MEMORY.md Index Integrity

If `MEMORY.md` exists in the memory directory:
- Check every file it links to exists
- Check every `.md` file in the memory directory (except `MEMORY.md`) has an entry
- Flag orphaned entries (link exists, file doesn't) and unindexed files (file exists, no link)

### 4. CLAUDE.md / AGENTS.md Accuracy Spot-Checks

For each `CLAUDE.md` / `AGENTS.md`, verify:
- Referenced directories still exist
- Tool/command counts match reality (e.g. "38 tools" — count actual tools)
- Package names in dependency tables are still in `package.json`

## Workflow

1. **Scan** — Run all 4 checks above. Collect findings silently.
2. **Report** — Present findings grouped by severity:
   - **STALE** — References to removed technologies (high confidence, likely wrong)
   - **BROKEN** — File paths that don't exist (definite errors)
   - **ORPHANED** — Memory index mismatches (index hygiene)
   - **DRIFT** — `CLAUDE.md`/`AGENTS.md` inaccuracies (may need judgement)
3. **Propose fixes** — For each finding, state what should change.
4. **Ask before fixing** — Present the report and wait for user approval before making any changes.

## Adding New Stale Terms

When a technology is removed from the project:
1. Edit `.claude/reconcile.config`. Add one ERE pattern per line.
2. Useful patterns: package names (`ioredis`), service names (`Old Service Name`), import paths (`@vendor/module`), domain names (`legacy\.example\.com`), removed module names (`gatewayBootstrap`).
3. The same config is consumed by the SessionEnd hook's stale-term grep, so adding here also flags drift at session end.
