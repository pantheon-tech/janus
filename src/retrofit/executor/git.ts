import { execFileSync } from 'node:child_process';

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
}

export function modifiedPaths(cwd: string): string[] {
  const out = git(cwd, ['status', '--porcelain']);
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
