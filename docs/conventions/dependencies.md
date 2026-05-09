---
title: Dependency Management
type: reference
last_reviewed: 2026-04-22
owners: []  # add owners for this project
---

# Dependency Management

> **Status: stub.** Conventions sketched below; canonical content TBD.

How janus projects add, audit, and update third-party dependencies.

## Adding a new dependency

TODO. Anticipated content:

- When to add (vs. write-it-yourself for a few lines).
- Maintainer / freshness / install-count thresholds.
- Licence check (MIT / Apache-2.0 / BSD acceptable; copyleft requires review).
- Bundle-size impact for frontend deps.
- Workspace placement (root vs package, peer vs dev vs prod).
- Lockfile commit policy.

## pnpm workspace conflicts

TODO. Anticipated content:

- Resolving version conflicts across workspace packages.
- `pnpm.overrides` policy.
- Hoisting concerns (`shamefully-hoist=false` default, exceptions).
- Strategy when one package needs a peer the workspace can't provide.

## Dependabot policy

TODO. Anticipated content:

- Group config (dev/prod separation already in `security.md`).
- Auto-merge criteria (patch + non-security + tests pass).
- Triage SLA for major-version PRs.
- Security-advisory PR handling.

## Removing a dependency

TODO. Anticipated content:

- When to remove vs. tolerate.
- `knip` / `depcheck` for unused-dep detection.
- Deprecation handling (consumed dep marked deprecated upstream).

## Unrecognized tools (retrofit warning allowlist)

This list controls which package.json devDependencies surface a `UNKNOWN_TOOL`
warning during `janus diagnose`. Adding a tool here is a one-PR change; janus
v0.1 does not migrate any of these.

- lint-staged
- rome
- dprint
- standard
- xo
- changeset
- @changesets/cli
- turbo
- nx
- parcel
- rollup
- esbuild
- tsup

## See also

- [`security.md`](./security.md) — Dependabot config sample, third-party Action SHA pinning.
- [`stack.md`](./stack.md) — pinned versions of core toolchain.
