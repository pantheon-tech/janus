# Architectural Decision Records

ADRs are reserved for **project-specific** architectural decisions in
janus-derived projects — choices that depart from, extend, or are not covered
by the conventions in [`../conventions/`](../conventions/).

The conventions chapters themselves are NOT ADRs. They evolve with janus
releases.

## Format

[MADR](https://adr.github.io/madr/) — see [TEMPLATE.md](./TEMPLATE.md).

## Policy

1. **Append-only.** Never rewrite an accepted ADR. Supersede via a new ADR that references the old.
2. **One decision per ADR.** If a single PR touches two decisions, write two ADRs.
3. **Numbered sequentially from 0001.** Never renumber.
4. **Status lifecycle**: `proposed` → `accepted` | `rejected` | `deprecated` | `superseded by ADR-NNNN`.
5. **Every derived project records its template version** in its own `docs/adr/0001-stack-choices.md`, citing the janus version it was scaffolded from.

## Index

No janus-level ADRs are open at present. See [TEMPLATE.md](./TEMPLATE.md) when one is needed.
