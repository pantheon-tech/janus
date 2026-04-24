# Plans

Implementation plans for janus itself.

## Layout

```
plans/
├── active/      — plans currently being executed
├── archived/    — completed or abandoned plans (kept for history)
└── TEMPLATE.md  — the plan-file shape
```

## Lifecycle

1. Draft a plan file at `plans/active/YYYY-MM-DD-<slug>.md`.
2. Work through phases, checking off tasks.
3. On completion or abandonment, move to `archived/`.
4. `active/` should rarely hold > 3 plans.
