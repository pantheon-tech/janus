import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';
import { JanusError } from '../../errors.js';
import type { Plan } from '../../types/index.js';

export type RetrofitCheckOpts = {
  plan: Plan;
  planPath: string;
  repoRoot: string;
  noRemoteCheck?: boolean;
};

const SUPPORTED_SCHEMA_VERSION = '1';

export async function runRetrofitChecks(opts: RetrofitCheckOpts): Promise<void> {
  const { plan, planPath, repoRoot, noRemoteCheck } = opts;

  // #10 schema version
  if (plan.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new JanusError(
      'SCHEMA_VERSION_MISMATCH',
      `plan schema_version=${plan.schema_version}, supported=${SUPPORTED_SCHEMA_VERSION}`,
    );
  }

  // #11 repo_root match
  const topLevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .toString('utf8')
    .trim();
  if (topLevel !== plan.payload.repo_root) {
    throw new JanusError(
      'REPO_ROOT_MISMATCH',
      `plan.repo_root=${plan.payload.repo_root} but git toplevel=${topLevel}`,
    );
  }

  // #12 tree clean (excluding plan file)
  const planRel = relative(topLevel, planPath);
  const porcelain = execFileSync('git', ['status', '--porcelain'], {
    cwd: repoRoot,
  })
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
  const dirty = porcelain.filter((line) => line.slice(3) !== planRel);
  if (dirty.length > 0) {
    throw new JanusError('TREE_DIRTY', `working tree dirty: ${dirty.join(', ')}`);
  }

  // #13 HEAD on tracking branch (not detached) — branch name not 'HEAD'
  const headBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoRoot,
  })
    .toString('utf8')
    .trim();
  if (headBranch === 'HEAD') {
    throw new JanusError('HEAD_DETACHED', 'HEAD is detached; check out a branch first');
  }

  // #14 target branch must not exist (local + remote unless --no-remote-check)
  const targetBranch = plan.payload.target_branch;
  let localExists = false;
  try {
    execFileSync('git', ['rev-parse', '--verify', `refs/heads/${targetBranch}`], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    localExists = true;
  } catch {
    // not present locally — good
  }
  if (localExists) {
    throw new JanusError(
      'TARGET_BRANCH_EXISTS',
      `local branch ${targetBranch} already exists`,
      'pass --branch with a different name or delete the existing branch',
    );
  }
  if (!noRemoteCheck) {
    let remoteOut: string;
    try {
      remoteOut = execFileSync(
        'git',
        ['ls-remote', '--heads', 'origin', targetBranch],
        { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
      )
        .toString('utf8')
        .trim();
    } catch (e) {
      throw new JanusError(
        'REMOTE_UNREACHABLE',
        `git ls-remote origin failed: ${(e as Error).message}`,
        're-run with --no-remote-check to skip the remote-existence verification',
      );
    }
    if (remoteOut.length > 0) {
      throw new JanusError(
        'TARGET_BRANCH_EXISTS',
        `remote branch ${targetBranch} already exists`,
        'pass --branch with a different name',
      );
    }
  }

  // #15 pnpm available
  try {
    execFileSync('pnpm', ['--version'], { stdio: 'pipe' });
  } catch {
    throw new JanusError('TOOL_MISSING', 'pnpm not found on PATH');
  }

  // #16 not from a linked worktree
  const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], {
    cwd: repoRoot,
  })
    .toString('utf8')
    .trim();
  const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: repoRoot,
  })
    .toString('utf8')
    .trim();
  if (gitDir !== commonDir) {
    throw new JanusError(
      'INVOKED_FROM_WORKTREE',
      'janus retrofit must run from the main checkout, not a linked worktree',
      'cd to the main worktree and re-run',
    );
  }
}
