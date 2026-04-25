---
name: activity-report
description: Generate an HTML activity report of Claude Code usage — engagement hours, business-hours vs out-of-hours split, day-by-day timelines, weekly rollups, hour-of-day patterns, optional git commit and PR integration. Use when the user asks for usage analytics, worked-hour totals, time-of-day analysis, or an insights report over a date range. Reads the authoritative `~/.claude/history.jsonl` prompt log (not session-meta, which is incomplete).
argument-hint: "[--since YYYY-MM-DD] [--until YYYY-MM-DD] [--business HH-HH] [--out PATH] [--git REPO] [--gh-repo OWNER/NAME]"
allowed-tools: Bash Read Write
---

Generate activity report: $ARGUMENTS

## Workflow

1. Parse any flags from the user's request. If the user names a date range in natural language ("since Feb 23", "last 2 months"), convert to ISO dates.
2. If the user hasn't specified `--git` but is clearly asking about a specific repo, pass `--git <path>` to include commit + PR analysis.
3. Invoke the bundled script:
   ```bash
   python3 ~/.claude/skills/activity-report/report.py <flags>
   ```
4. Read the stdout summary. Pull out the headline numbers and present them in chat:
   - Total hours worked, active days, longest streak
   - In-hours vs out-of-hours split
   - Peak days / peak hours
   - Any surprising patterns visible in the daily OOH run
5. Point the user at the HTML file path that was written.

## Defaults

| Setting | Default |
|---|---|
| Period | Last 60 days |
| Business hours | 09:00–16:00 local |
| Block threshold | Gap < 60 min = same continuous block |
| Timezone | System local (via `ZoneInfo`) |
| History source | `~/.claude/history.jsonl` |
| Output HTML | `~/claude-activity-report.html` |
| Projects included | All paths under `$HOME/` except `.claude-mem*` (observer sessions) |
| Git/PR analysis | Disabled unless `--git` passed |

## Arguments

| Flag | Purpose | Default |
|---|---|---|
| `--since YYYY-MM-DD` | Period start | 60 days ago |
| `--until YYYY-MM-DD` | Period end | today |
| `--business H1-H2` | Business window (24h local) | `09-16` |
| `--out PATH` | HTML output file | `~/claude-activity-report.html` |
| `--tz NAME` | IANA timezone | system |
| `--git REPO` | Git repo for commits (enables git section) | — |
| `--gh-repo OWNER/NAME` | GitHub repo for PRs | auto-detect from `--git` remote |
| `--include PATH` | Only project paths starting with PATH (repeatable) | all |
| `--exclude PATH` | Exclude project paths (repeatable) | `.claude-mem` |
| `--history PATH` | Prompt log path | `~/.claude/history.jsonl` |
| `--block-gap MIN` | Max gap inside a continuous block (minutes) | `60` |
| `--no-html` | Print summary only, skip HTML | off |

## What the HTML contains

- Headline stat cards (total hours, active days, streak, prompts, commits, PRs, OOH percentage)
- Business-vs-OOH stacked bar + per-zone table + heaviest OOH days
- Day-by-day table: hours label, proportional in/out bar, counters, colour-coded 48-cell timeline per day (each half-hour coloured by zone: business / early / evening / late-eve / overnight)
- Weekly rollup with in/out mini-bars
- Weekly hour-coverage heatmap (9 weeks × 24 hours, cell intensity = days that week with activity in that hour)
- Day-of-week averages with OOH %
- Hour-of-day pattern with zone colouring
- Top-day rankings (hours / prompts / commits / OOH)
- Legend
- Dark/light mode via `prefers-color-scheme`

## What the terminal output contains

- Totals summary (hours, split, zone breakdown)
- OOH-heavy day count
- Per-day run with `early / eve / late / ovn` columns + bar
- Weekly subtotals
- Grand total

## Key definitions

- **Hours worked** = sum of continuous-block durations. A block is ≥2 prompts with every gap shorter than `--block-gap` (default 60 min). Singleton prompts contribute 0 hours but are counted.
- **Business hours** = `[H1, H2)` local — inclusive start, exclusive end. `--business 09-16` = 09:00 up to 16:00.
- **OOH zones**: early (05 → business-start), evening (business-end → 20), late (20 → 23), overnight (23 → 05).

## Gotchas

- **`history.jsonl` is the source of truth**, not `session-meta/`. Session-meta is generated only when sessions cleanly end/compact, and was missing ~75% of activity in testing. Always read `history.jsonl` for timing counts.
- **Timezone matters for DST**. The script uses `ZoneInfo` via `astimezone()`, so DST transitions are handled automatically. Don't hardcode an offset.
- **If `--git` is set but the repo has no commits in the window**, the git section will show 0s — not an error.
- **`gh pr list` needs auth**. If the user hasn't run `gh auth login` for the target repo, PRs will be skipped silently.

## Examples

- Default (last 60 days, 9-4 NZ):
  ```bash
  python3 ~/.claude/skills/activity-report/report.py
  ```
- Custom period with git + PR:
  ```bash
  python3 ~/.claude/skills/activity-report/report.py \
    --since 2026-01-01 --until 2026-03-31 \
    --git ~/path/to/repo --gh-repo OWNER/REPO
  ```
- 9-5 business hours, one project only:
  ```bash
  python3 ~/.claude/skills/activity-report/report.py \
    --business 09-17 --include ~/path/to/repo
  ```
- Terminal-only (no HTML):
  ```bash
  python3 ~/.claude/skills/activity-report/report.py --no-html
  ```
