## Summary

<What this PR changes in janus, in 1-2 sentences.>

## Context

<Why — motivation, linked issue, review finding. `Fixes #N` or `Related: #N`.>

## Changes

- <Key change 1>
- <Key change 2>

## Affects

- [ ] `scripts/scaffold.sh` (scaffold logic)
- [ ] `templates/_shared/` (shared overlay)
- [ ] `templates/<archetype>/` (archetype-specific overlay)
- [ ] `docs/conventions/` (snapshotted into projects)
- [ ] janus root configs (parity-checked against `templates/_shared/`)
- [ ] CI workflows
- [ ] None of the above

## Test plan

- [ ] `pnpm biome check .` passes locally
- [ ] `bash tests/scaffold-smoke-test.sh` passes locally
- [ ] If templates changed: re-rendered to a tmpdir and inspected the diff
- [ ] If `templates/_shared/` changed: root configs synced to match (parity)
- [ ] Workflows lint clean (`actionlint` if installed)

## Rollback plan

<If this scaffolds a broken project, how do downstream users recover?>

## Notes for reviewers

<!-- anything non-obvious, e.g. why a slot was renamed, why a SHA was bumped -->
