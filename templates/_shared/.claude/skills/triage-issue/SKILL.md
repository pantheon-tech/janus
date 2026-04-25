---
name: triage-issue
description: Triage a GitHub issue — classify severity, assign component/priority/difficulty/effort labels, set milestone
argument-hint: "[issue-number]"
disable-model-invocation: true
allowed-tools: Bash(gh *)
---

Triage GitHub issue #$ARGUMENTS.

## Workflow

1. Fetch the issue:
   ```bash
   gh issue view $ARGUMENTS --json title,body,labels,milestone
   ```

2. Read the project's label rubric: [label-rubric.md](label-rubric.md). The component list and any project-specific routing live there. Update `label-rubric.md` whenever your component taxonomy changes.

3. Skip if the issue already has:
   - A priority label (`P0:` through `P3:`) AND a milestone — human already triaged
   - The `auto-triaged` label — already processed

4. Classify the issue per the rubric:
   - **Component** — from file paths in body, keywords, or explicit references
   - **Type** — bug, enhancement, security, documentation, performance, testing, code-review
   - **Priority** — P0 through P3 per rubric
   - **Difficulty** — 1–10 per rubric
   - **Effort** — 1–10 per rubric
   - **Environment** — `env:dev`, `env:staging`, `env:prod` from branch/context clues

5. Apply labels:
   ```bash
   gh issue edit $ARGUMENTS --add-label "COMPONENT,TYPE,PRIORITY,difficulty:N,effort:N,ENV,auto-triaged"
   ```

6. Assign milestone:
   ```bash
   gh issue edit $ARGUMENTS --milestone "MILESTONE"
   ```

7. Post a triage comment:
   ```bash
   gh issue comment $ARGUMENTS --body "**Auto-triage:** PRIORITY · difficulty:N · effort:N · COMPONENT, TYPE → MILESTONE · ENV

   Reasoning: [1-2 sentence explanation]"
   ```

8. If confidence is low on any dimension, use `needs-triage` label instead of guessing:
   ```bash
   gh issue edit $ARGUMENTS --add-label "needs-triage"
   gh issue comment $ARGUMENTS --body "**Auto-triage:** Partial classification applied. Could not confidently determine: [what's unclear]. Please review."
   ```
