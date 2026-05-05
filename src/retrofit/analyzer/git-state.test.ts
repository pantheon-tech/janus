import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyzeGitState } from './git-state.js';

describe('analyzeGitState', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('reports head_branch from a fresh fixture', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const state = analyzeGitState(fx.dir);
    expect(state.git.head_branch).toBe('main');
    expect(state.git.is_tracking).toBe(false);
    expect(state.git.tree_clean).toBe(true);
    expect(state.git.has_submodules).toBe(false);
  });

  it('reports tree_clean: false when working tree is dirty', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'untracked.txt'), 'hello');
    const state = analyzeGitState(fx.dir);
    expect(state.git.tree_clean).toBe(false);
  });

  it('parses an https github remote', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/pantheon-tech/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const state = analyzeGitState(fx.dir);
    expect(state.remote.origin_url).toBe('https://github.com/pantheon-tech/foo.git');
    expect(state.remote.parsed).toEqual({
      host: 'github.com',
      org: 'pantheon-tech',
      repo: 'foo',
    });
  });

  it('parses an ssh github remote', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin git@github.com:pantheon-tech/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const state = analyzeGitState(fx.dir);
    expect(state.remote.parsed).toEqual({
      host: 'github.com',
      org: 'pantheon-tech',
      repo: 'foo',
    });
  });

  it('returns parsed: undefined for non-github remotes', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://gitlab.example.com/team/proj.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const state = analyzeGitState(fx.dir);
    expect(state.remote.origin_url).toBe('https://gitlab.example.com/team/proj.git');
    expect(state.remote.parsed).toBeUndefined();
  });
});
