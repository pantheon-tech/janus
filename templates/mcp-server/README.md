# mcp-server archetype

Stdio MCP server — one tool per file, registered via a central registry.

## Status

**Stub** — scaffold content TODO.

## Planned structure

```
<package>/
├── src/
│   ├── tools/
│   │   ├── query/              # read-only
│   │   │   ├── get-<resource>.ts
│   │   │   └── list-<resource>.ts
│   │   ├── mutation/           # state-changing
│   │   │   └── create-<resource>.ts
│   │   └── index.ts            # registry — registerTools(server)
│   ├── schemas/                # zod input schemas
│   ├── client/                 # connection to the real backend
│   ├── lib/
│   │   ├── logger.ts
│   │   └── errors.ts
│   └── index.ts                # stdio transport entry
├── package.json
├── tsconfig.json
├── AGENTS.md
└── README.md
```

## Planned contents

- **Tool naming**: `{{workload}}_<verb>_<resource>` (e.g. `myapp_get_order`).
- **Health-check tool**: every server has `{{workload}}_ping`.
- **Confirmation pattern for destructive tools**: `{status: 'requires_confirmation', preview: {...}}` on first call; execute on second call with `confirm: true`.
- **Zod input schemas** — every tool's parameters validated at the MCP boundary.
- **No console output** on stdio transport — logs go to stderr only.

## See also

- [MCP Spec](https://modelcontextprotocol.io/specification)
- [Anthropic MCP SDKs](https://github.com/modelcontextprotocol)
