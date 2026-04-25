#!/usr/bin/env node
/**
 * Stdio MCP server entry point.
 *
 * IMPORTANT: this process communicates with the MCP host over stdout/stdin.
 * Never write to stdout (console.log). Use console.error for diagnostic
 * output — it goes to stderr and is invisible to the MCP protocol layer.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { echoInputSchema, handleEcho } from './echo.js';

const server = new McpServer({
  name: 'mcp-server',
  version: '0.0.0',
});

server.registerTool(
  'echo',
  {
    description: 'Echo a message back to the caller.',
    inputSchema: echoInputSchema,
  },
  async (input) => handleEcho(input),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP server listening on stdio');
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
