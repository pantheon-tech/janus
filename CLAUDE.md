@AGENTS.md

## Claude-specific

- When editing ADRs in `docs/adr/`: never rewrite an accepted ADR — add a superseding one that links back.
- When adding new conventions: update `docs/conventions/` AND cross-reference from the relevant ADR.
- Templates use `{{snake_case}}` for placeholders. Preserve them literally until scaffold-time substitution.
- This is a meta-repo — changes here affect every future project scaffolded from it. Propose before editing load-bearing files.
