import { execFileSync } from 'node:child_process';

/**
 * Replicates `jq -s '.[0] * .[1]' a.json b.json`:
 *   - Object recursion at all levels.
 *   - Right-operand wins at leaf positions (scalars and arrays).
 *
 * Shells out to system `jq` for byte-for-byte agreement with scaffold.sh.
 */
export function jqDeepMerge(left: unknown, right: unknown): unknown {
  const input = `${JSON.stringify(left)}\n${JSON.stringify(right)}\n`;
  const out = execFileSync('jq', ['-s', '.[0] * .[1]'], {
    input,
    stdio: ['pipe', 'pipe', 'inherit'],
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(out);
}
