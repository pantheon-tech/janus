import { execSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { suggestAvailableBranch } from './git.js';

describe('suggestAvailableBranch', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('returns -2 when base exists', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git branch janus/retrofit', { cwd: fx.dir, stdio: 'pipe' });
    expect(suggestAvailableBranch(fx.dir, 'janus/retrofit', true)).toBe('janus/retrofit-2');
  });

  it('returns -3 when base + -2 exist', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git branch janus/retrofit', { cwd: fx.dir, stdio: 'pipe' });
    execSync('git branch janus/retrofit-2', { cwd: fx.dir, stdio: 'pipe' });
    expect(suggestAvailableBranch(fx.dir, 'janus/retrofit', true)).toBe('janus/retrofit-3');
  });
});
