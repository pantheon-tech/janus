import { execFileSync } from 'node:child_process';
import { JanusError } from '../errors.js';

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
}

export function modifiedPaths(cwd: string): string[] {
  // -uall expands untracked-dir entries (`.github/`) into individual files so the
  // step driver can match them against `commit_paths`. Pre-flight already enforces
  // a clean tree, so the per-step listing is bounded to files this run produced.
  const out = git(cwd, ['status', '--porcelain', '-uall']);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3));
}

export function checkoutNewBranch(cwd: string, branch: string): void {
  git(cwd, ['checkout', '-b', branch]);
}

export function stageAndCommit(cwd: string, paths: string[], message: string): void {
  if (paths.length > 0) git(cwd, ['add', ...paths]);
  git(cwd, ['commit', '-m', message]);
}

export function lastCommitSha(cwd: string): string {
  return git(cwd, ['rev-parse', 'HEAD']).trim();
}

function branchExists(repoRoot: string, branch: string, noRemoteCheck: boolean): boolean {
  try {
    git(repoRoot, ['rev-parse', '--verify', `refs/heads/${branch}`]);
    return true;
  } catch {
    // local missing; check remote
  }
  if (noRemoteCheck) return false;
  try {
    const out = git(repoRoot, ['ls-remote', '--heads', 'origin', branch]).trim();
    return out.length > 0;
  } catch {
    return false; // ls-remote failure → treat as not present
  }
}

export function suggestAvailableBranch(
  repoRoot: string,
  base: string,
  noRemoteCheck: boolean,
): string {
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    if (branchExists(repoRoot, candidate, noRemoteCheck)) continue;
    return candidate;
  }
  throw new JanusError('BRANCH_SUGGESTION_EXHAUSTED', `no available branch in ${base}-2..99`);
}
