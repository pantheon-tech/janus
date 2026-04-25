---
name: fix
description: Fix a bug or code review finding using a test-driven approach. Reads the finding, writes a failing test, implements the minimal fix, verifies.
argument-hint: "[description or issue-number]"
disable-model-invocation: true
allowed-tools: Read Write Edit Bash Grep Glob
---

Fix: $ARGUMENTS

## Workflow

1. **Understand the finding.** Read the issue, PR comment, or alert. Identify the exact file and line. Understand WHY it's a problem, not just WHAT was flagged.

2. **Verify it's a true positive.** If the finding is a false positive (e.g. a static-analysis tool flagging sanitised input as unsafe), comment on the PR/issue explaining why and do NOT make changes. If unsure, ask.

3. **Write a failing test** when the issue is testable. Use the project's test runner (see `package.json` scripts; typical: `pnpm test` or scoped variants for monorepos).

4. **Implement the minimal fix.** Change only what's needed to address the finding. Do not:
   - Refactor surrounding code
   - Add unrelated improvements
   - Change code style or formatting
   - Add features not requested

5. **Run tests** to verify the fix doesn't break anything: `pnpm test` (or whatever the project uses).

6. **Commit** with a Conventional Commits message:
   ```
   fix(<component>): <what was fixed>
   ```
   Pick `<component>` from the project's label taxonomy (see `CLAUDE.md` or `AGENTS.md`).

7. **If the fix is too complex** — the issue requires architectural decisions, touches security-critical code, or you're unsure of the correct approach:
   - Do NOT push a guess
   - Create a follow-up issue describing what you found and what you think needs to happen
   - Comment on the original issue/PR explaining why you didn't fix it
   - This is the correct outcome — bad fixes are worse than no fix

## Rules

- Never skip pre-commit hooks (`--no-verify`)
- Never bypass type checking
- Never push directly to `main` — only commit to a feature branch (per janus convention, branch off `staging`)
- Follow existing code patterns in the file you're modifying
- For PR fixes, push to the PR's branch, not main/staging
