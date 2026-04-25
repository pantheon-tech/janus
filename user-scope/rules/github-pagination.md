---
description: Always paginate GitHub API results fully
---

When fetching paginated results from GitHub API (issues, PRs, etc.), always check for pagination and fetch ALL pages. Use `--paginate` with gh CLI or set `per_page=100` and loop until exhausted. Never assume the first page contains all results.
