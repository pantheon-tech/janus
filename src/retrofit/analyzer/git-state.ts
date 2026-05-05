import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoSnapshot } from '../types/index.js';

type GitState = Pick<RepoSnapshot, 'git' | 'remote'>;

export function analyzeGitState(repoRoot: string): GitState {
  const head_branch = runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();

  let is_tracking = false;
  try {
    runGit(repoRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    is_tracking = true;
  } catch {
    is_tracking = false;
  }

  const porcelain = runGit(repoRoot, ['status', '--porcelain']);
  const tree_clean = porcelain.trim() === '';

  const has_submodules = existsSync(join(repoRoot, '.gitmodules'));

  let origin_url: string | undefined;
  try {
    origin_url = runGit(repoRoot, ['remote', 'get-url', 'origin']).trim();
  } catch {
    origin_url = undefined;
  }

  const parsed = origin_url ? parseGithubRemote(origin_url) : undefined;

  const remote: GitState['remote'] = {};
  if (origin_url !== undefined) remote.origin_url = origin_url;
  if (parsed !== undefined) remote.parsed = parsed;

  return {
    git: { head_branch, is_tracking, tree_clean, has_submodules },
    remote,
  };
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
}

// Match github.com remotes only. Returns undefined for any other host —
// workload/github_org slots only auto-source from github per §5a.
function parseGithubRemote(url: string): { host: string; org: string; repo: string } | undefined {
  const httpsMatch = url.match(/^https?:\/\/(github\.com)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (httpsMatch) {
    return { host: httpsMatch[1]!, org: httpsMatch[2]!, repo: httpsMatch[3]! };
  }
  const sshMatch = url.match(/^git@(github\.com):([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { host: sshMatch[1]!, org: sshMatch[2]!, repo: sshMatch[3]! };
  }
  return undefined;
}
