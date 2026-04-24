# 0005 — AGENTS.md Primary, CLAUDE.md Pointer

- **Status**: accepted
- **Date**: 2026-04-24
- **Deciders**: @skipnz
- **Supersedes**: implicit "CLAUDE.md is primary" convention from 2025 work

## Context

The dominant pre-2026 convention in surveyed projects was `CLAUDE.md` at the project root as the primary agent-context file — adopted across AEX, pantheon-tech repos, skipnz personal work, etc. Each project has a 7-section `CLAUDE.md` (Overview, Tech Stack, Commands, Structure, Critical Context, Design Decisions, Known Issues).

In December 2025, the Linux Foundation announced the Agentic AI Foundation, under which **AGENTS.md** (alongside MCP and Agent Skills) is now the stewarded standard for portable agent-context files. Adoption:
- ~60,000 projects recognise AGENTS.md.
- Founding coalition: OpenAI, Amp, Jules, Cursor, Factory.
- Native recognition: Claude Code, Codex, Gemini CLI, Copilot, Cursor, Amp, Aider, OpenHands, Jules.

Keeping CLAUDE.md as primary means:
- Projects only work well with Claude Code; other tools fall back to a generic system prompt.
- Duplicated effort if team / contributor uses a different AI tool.
- Miss the portable-context-file ecosystem (other tools converging on the standard).

## Decision

**`AGENTS.md` is the primary agent-context file** in every janus-scaffolded project. **`CLAUDE.md` is a thin pointer** containing only Claude-specific additions.

### AGENTS.md shape (the 7-section template carries over unchanged)

```markdown
# <project-name>

<1-2 sentence what-this-is>

## Tech Stack
<table>

## Commands
<bash block with canonical commands>

## Structure
<file tree or bullet list>

## Critical Context
<≤10 terse bullets — non-obvious invariants>

## Design Decisions
<links to docs/adr/>

## Known Issues
<dated list>

---
*Last reviewed: YYYY-MM-DD*
```

**~100 lines max**. When content exceeds this, extract to `docs/adr/` or package-level `AGENTS.md`.

### CLAUDE.md shape

```markdown
@AGENTS.md

## Claude-specific

- <anything that only applies to Claude Code, e.g. skill hints, compaction directives>
- <keep under 20 lines>
```

The `@AGENTS.md` line imports AGENTS.md into Claude's context (Claude Code native syntax). Other tools read AGENTS.md directly.

### Per-package (monorepo)

Each package has its own `AGENTS.md` file in its directory. Claude Code loads nested AGENTS.md on demand when working in that subtree. The package-level file is a **delta** from the root — it does not duplicate.

## Consequences

### Positive
- **Tool-portable**: same file steers Claude Code, Codex, Cursor, Amp, Copilot, Gemini CLI — a contributor choosing a different tool still benefits from the project's context.
- **Standards-aligned**: projects participate in the AGENTS.md ecosystem.
- **Future-proof**: as more tools converge on AGENTS.md, the value compounds.

### Negative
- **Breaks symmetry** with 2025-era projects that have heavy CLAUDE.md content. Migrating is manual: rename to AGENTS.md, reduce CLAUDE.md to pointer. Per-project ADR tracks the migration.
- **Two files** instead of one adds minor maintenance overhead. Mitigated by CLAUDE.md being short.

### Neutral
- **Emphasis markers**: the 7-section shape survives, but liberal `CRITICAL`/`MANDATORY`/`NEVER` markers (prevalent in older CLAUDE.md files) are capped at 1–3 per file to avoid Opus 4.5+ overtriggering. Documented in `docs/conventions/code-style.md`.

## Considered Alternatives

- **CLAUDE.md only** — rejected. Locks the project to Claude Code tooling.
- **AGENTS.md only, no CLAUDE.md** — rejected. Leaves Claude-specific directives nowhere. Cheap to have both when CLAUDE.md is ~20 lines.
- **Duplicate content in both files** — rejected. Rot-prone; defeats the portability goal.
- **Keep heavy CLAUDE.md, add thin AGENTS.md** — rejected. Reverses the intended precedence.

## References

- [AGENTS.md specification](https://agents.md/)
- [Linux Foundation Agentic AI Foundation](https://www.linuxfoundation.org/projects) (Dec 9 2025 launch)
- `/home/skip/claude-plugins/research-v2/05-adjacent-tools-comparison.md` — AGENTS.md convergence analysis
- `/home/skip/claude-plugins/research-v2/08-novel-emerging-patterns.md` §1 — standards coalition
