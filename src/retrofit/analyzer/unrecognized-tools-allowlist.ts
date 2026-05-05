import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const HEADING = '## Unrecognized tools (retrofit warning allowlist)';

/**
 * Read the canonical retrofit-allowlist of "unrecognized but acceptable" tool
 * names from `<janusRoot>/docs/conventions/dependencies.md`. The list lives
 * under the exact heading `## Unrecognized tools (retrofit warning allowlist)`
 * and ends at the next `## ` heading or EOF.
 *
 * Returns `[]` when the file is absent or the heading is missing.
 */
export async function loadUnrecognizedToolsAllowlist(janusRoot: string): Promise<string[]> {
  const path = join(janusRoot, 'docs/conventions/dependencies.md');
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf8');

  const lines = content.split('\n').map((l) => l.replace(/\r$/, ''));
  const out: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (line === HEADING) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (line.startsWith('## ')) break;
    const m = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (m) {
      out.push(m[1]!);
    }
  }
  return out;
}
