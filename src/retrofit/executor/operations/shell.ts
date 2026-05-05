import { execSync } from 'node:child_process';
import { JanusError } from '../../errors.js';
import type { Operation } from '../../types/index.js';
import { SHELL_WHITELIST, type ShellCommand } from '../../types/index.js';

// Index → ignore-exit policy. Order matches Plan 1's SHELL_WHITELIST tuple:
//   [0] 'pnpm install'
//   [1] 'pnpm dedupe'
//   [2] 'git config --unset core.hooksPath'                       (idempotent — non-zero is fine)
//   [3] 'find .git/hooks -type f -not -name "*.sample" -delete'   (no matches → non-zero)
const IGNORE_EXIT_FOR: ReadonlySet<ShellCommand> = new Set([
  SHELL_WHITELIST[2],
  SHELL_WHITELIST[3],
]);

export async function applyShell(
  op: Extract<Operation, { op: 'shell' }>,
  ctx: { repoRoot: string },
): Promise<void> {
  const command = op.command as ShellCommand;
  if (!(SHELL_WHITELIST as readonly string[]).includes(command)) {
    throw new JanusError('SHELL_NOT_WHITELISTED', `command not on whitelist: ${op.command}`);
  }
  try {
    execSync(command, { cwd: ctx.repoRoot, stdio: 'pipe' });
  } catch (e) {
    if (!IGNORE_EXIT_FOR.has(command)) throw e;
  }
}
