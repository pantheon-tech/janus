# Architectural Decision Records

ADRs are numbered, dated, append-only records of significant decisions.

## Format

[MADR](https://adr.github.io/madr/) — see [TEMPLATE.md](./TEMPLATE.md).

## Policy

1. **Append-only.** Never rewrite an accepted ADR. Supersede via a new ADR that references the old.
2. **One decision per ADR.** If a single PR touches two decisions, write two ADRs.
3. **Numbered sequentially from 0001.** Never renumber.
4. **Status lifecycle**: `proposed` → `accepted` | `rejected` | `deprecated` | `superseded by ADR-NNNN`.
5. **Every derived project gets a copy of `0001` as its own `0001-stack-choices.md`**, citing this repo's template version.

## Index

| # | Title | Status |
|---|---|---|
| [0001](./0001-stack-choices.md) | Stack choices (canonical) | accepted |
| [0002](./0002-azure-resource-naming.md) | Azure resource naming convention | accepted |
| [0003](./0003-secret-management.md) | Secret management — four-layer model | accepted |
| [0004](./0004-avm-first-infrastructure.md) | AVM-first Azure infrastructure | accepted |
| [0005](./0005-agents-md-primary.md) | AGENTS.md primary, CLAUDE.md pointer | accepted |
| [0006](./0006-documentation-shapes.md) | Five and only five documentation shapes | accepted |
