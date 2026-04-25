---
description: File issues for problems discovered mid-task; don't expand scope
---

When you find a bug, code smell, missing test, or improvement opportunity while working on something else, file a GitHub issue rather than fixing it inline.

Reasons:
- Keeps the current PR atomic and reviewable.
- Discovered problems may be larger than they look — investigation belongs in its own task.
- Future-you (or a teammate) gets a tracked queue rather than scattered TODOs.

Exceptions — fix inline only when:
- The problem is in code you're already changing as part of the current task.
- The fix is trivial (one-line typo, missing import) and clearly within scope.
- Leaving it would block the current task from being verifiable.

Use `gh issue create` with appropriate labels. Don't leave orphan `// TODO` comments.
