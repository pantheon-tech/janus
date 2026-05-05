import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { JanusError } from '../errors.js';
import type { Operation, Plan } from '../types/index.js';
import { SHELL_WHITELIST } from '../types/index.js';
import { lastCommitSha, modifiedPaths, stageAndCommit } from './git.js';
import { applyOperation } from './operations/dispatch.js';

type Step = Plan['payload']['steps'][number];

export type StepResult =
  | { status: 'committed'; sha: string }
  | { status: 'skipped'; reason: string }
  | { status: 'committed_empty'; reason: string };

export type ExecuteStepOpts = {
  /**
   * Set of relative paths to ignore when checking for extraneous file modifications.
   * Used by execute() to exclude the on-disk plan file (which is untracked but pre-existing
   * before the executor runs) from the EXTRANEOUS_FILE_MODIFICATIONS guard.
   */
  ignorePaths?: ReadonlySet<string>;
};

export async function executeStep(
  step: Step,
  repoRoot: string,
  opts: ExecuteStepOpts = {},
): Promise<StepResult> {
  // 1. Preconditions.
  for (const pre of step.preconditions) {
    if (pre.type === 'file_exists' && !existsSync(join(repoRoot, pre.path))) {
      return { status: 'skipped', reason: `precondition failed: file_exists ${pre.path}` };
    }
    if (pre.type === 'file_absent' && existsSync(join(repoRoot, pre.path))) {
      return { status: 'skipped', reason: `precondition failed: file_absent ${pre.path}` };
    }
  }

  // 2. + 3. Apply each op (handlers do their own pre_state_hash check).
  for (const op of step.operations) await applyOperation(op as Operation, { repoRoot });

  // 4. Verify modified paths against commit_paths.
  const ignore = opts.ignorePaths ?? new Set<string>();
  const modified = modifiedPaths(repoRoot).filter((p) => !ignore.has(p));
  const expected = new Set(step.commit_paths);
  const extraneous = modified.filter((p) => !expected.has(p) && !isExpectedByOpClass(p, step));
  if (extraneous.length > 0) {
    throw new JanusError(
      'EXTRANEOUS_FILE_MODIFICATIONS',
      `step ${step.id} produced unexpected modifications: ${extraneous.join(', ')}`,
    );
  }

  if (modified.length === 0) {
    return { status: 'committed_empty', reason: 'no modifications after ops' };
  }

  // 5. Stage + commit. Hooks run; the executor never bypasses with --no-verify (per §9).
  stageAndCommit(repoRoot, step.commit_paths, step.commit_message);
  const sha = lastCommitSha(repoRoot);
  return { status: 'committed', sha };
}

/**
 * Returns true when the modified path is "expected" for some operation in `step` even though
 * it is NOT in `step.commit_paths`. This is the carve-out for shell ops whose side-effects
 * are outside git's view (writes under `.git/`).
 */
function isExpectedByOpClass(path: string, step: Step): boolean {
  for (const op of step.operations) {
    if (op.op !== 'shell') continue;
    const cmd = (op as Extract<Operation, { op: 'shell' }>).command;
    if (cmd === SHELL_WHITELIST[2] || cmd === SHELL_WHITELIST[3]) {
      if (path.startsWith('.git/') || path === '.git') return true;
    }
  }
  return false;
}
