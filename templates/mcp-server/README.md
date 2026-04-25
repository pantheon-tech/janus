# mcp-server archetype

Stdio Model Context Protocol server — publishable npm package, runs as a subprocess,
communicates with MCP hosts (Claude Code, Claude Desktop, etc.) over stdin/stdout.

## When to pick this archetype

- You are building an MCP server that Claude Code or Claude Desktop will invoke as a local subprocess.
- The server should be installable via `npm install -g <name>` and invoked by name.
- No Azure infrastructure needed (MCP servers are published to npm, not deployed to cloud).
- You want tool schemas validated with zod and automatically converted to JSON Schema.

## What ships

| File | Purpose |
|---|---|
| `src/index.ts` | stdio transport entry — shebang, wires tools, calls `server.connect(transport)` |
| `src/echo.ts` | Example tool: zod schema + pure handler function |
| `tests/server.test.ts` | Vitest test — imports pure handler, no stdio required |
| `.github/workflows/release.yml` | release-please — bumps version and CHANGELOG on `main` merges |
| `package.json` | `private: false`, `bin` entry, `"type": "commonjs"` |

Shared workflows included: `ci.yml`, `claude-code-review.yml`, `claude.yml`, `codeql.yml`,
`docs-staleness.yml`, `issue-triage.yml`, `pr-merge-cleanup.yml`.

Not included (excluded via `.exclude`): `infra/`, `deploy.yml`, `infra-preview.yml`,
`claude-autofix.yml`.

## How to run from Claude Code

After `pnpm build` (or after `npm install -g <name>` for published packages), add to
your Claude Code settings:

```json
{
  "mcpServers": {
    "<workload>": {
      "command": "node",
      "args": ["/path/to/dist/index.js"]
    }
  }
}
```

Or after global install:

```json
{
  "mcpServers": {
    "<workload>": {
      "command": "<workload>",
      "args": []
    }
  }
}
```

For Claude Desktop, add the same block to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows).

## How to publish

1. Merge to `main` with a Conventional Commit (`feat:`, `fix:`, etc.).
2. release-please opens a release PR with the bumped version and CHANGELOG.
3. Merge the release PR → GitHub Release is created.
4. Add an `npm publish` step in `release.yml` gated on `release_created` if you want
   automatic npm publishing (requires an `NPM_TOKEN` secret).

## Critical constraints for any MCP server

- **Never write to stdout** except via the MCP SDK. `console.log()` corrupts the JSON-RPC
  stream. Use `console.error()` for all diagnostics (goes to stderr).
- **Factor handlers into pure functions** (`src/<tool>.ts`) so tests can import them
  without starting the transport.
- **Zod schemas for all inputs** — the SDK converts them to JSON Schema for the protocol
  and validates incoming calls before your handler runs.
- **CJS output** (`"type": "commonjs"`) — the shebang entry requires Node to load `.js`
  as CommonJS. The tsup build target is `cjs`.

## See also

- [MCP Specification](https://modelcontextprotocol.io/specification)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [janus conventions](../../docs/conventions/)
