import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Render a Mustache template by shelling out to the vendored `scripts/lib/mo`.
 *
 * `mo` reads slot values from process environment variables. We pass them via
 * the `env` option so the host process's env is unaffected and concurrent
 * renders don't clobber each other.
 */
export function renderMo(
  janusRoot: string,
  tmplPath: string,
  slots: Record<string, string>,
): Buffer {
  const moPath = join(janusRoot, 'scripts/lib/mo');
  return execFileSync(moPath, [tmplPath], {
    stdio: ['ignore', 'pipe', 'inherit'],
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      ...slots,
    },
    maxBuffer: 16 * 1024 * 1024,
  });
}
