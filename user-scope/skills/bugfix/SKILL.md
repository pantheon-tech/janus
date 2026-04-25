---
name: bugfix
description: Fix a bug using a strict test-driven red-green loop
argument-hint: "<bug description>"
---

Fix this bug using a strict test-driven loop. Do NOT commit until all tests pass.

Process:
1. Trust the user's diagnosis — do not re-investigate the root cause
2. Verify you're in the correct worktree: `git rev-parse --show-toplevel`
3. Read the relevant source files and existing tests
4. Write a failing test that reproduces the exact bug
5. Run the test command to confirm it fails for the right reason
6. Make the minimal code change to fix the bug
7. Run tests again. If they fail, read the error, adjust, re-run. Loop up to 5 times.
8. If after 5 attempts tests still fail, stop and explain what's blocking
9. Once green: check for unused imports, run the build, then commit

Do not add unrelated changes. Do not ask questions — make your best judgment and keep iterating.
