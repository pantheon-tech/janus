import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import type { Plan } from '../../types/index.js';
import { runRetrofitChecks } from './retrofit-checks.js';

const samplePlan = (over: Partial<Plan['payload']> = {}): Plan => ({
  schema_version: '1',
  meta: { janus_version: '0.1.0', generated_at: '2026-05-05T00:00:00Z' },
  payload: {
    repo_root: '/tmp/replaced-by-test',
    archetype: 'generic-ts',
    target_branch: 'janus/retrofit',
    slots: {} as Plan['payload']['slots'],
    plugins: [],
    prior_marker: null,
    warnings: [],
    steps: [],
    ...over,
  },
});

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toMatchObject({ code });
}

describe('runRetrofitChecks (#9–#16)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('throws SCHEMA_VERSION_MISMATCH when plan declares version != "1"', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const plan = samplePlan({});
    plan.schema_version = '2' as never;
    plan.payload.repo_root = fx.dir;
    await expectCode(
      runRetrofitChecks({
        plan,
        planPath: '/tmp/x.json',
        repoRoot: fx.dir,
        noRemoteCheck: true,
      }),
      'SCHEMA_VERSION_MISMATCH',
    );
  });

  it('throws REPO_ROOT_MISMATCH when plan.repo_root does not match cwd toplevel', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const plan = samplePlan({ repo_root: '/wrong/path' });
    await expectCode(
      runRetrofitChecks({
        plan,
        planPath: '/tmp/x.json',
        repoRoot: fx.dir,
        noRemoteCheck: true,
      }),
      'REPO_ROOT_MISMATCH',
    );
  });

  it('throws TREE_DIRTY when working tree has uncommitted changes other than the plan file', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'untracked.txt'), 'x');
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, '{}');
    const plan = samplePlan({ repo_root: fx.dir });
    await expectCode(
      runRetrofitChecks({ plan, planPath, repoRoot: fx.dir, noRemoteCheck: true }),
      'TREE_DIRTY',
    );
  });

  it('passes when working tree is clean except for the plan file itself', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, '{}');
    const plan = samplePlan({ repo_root: fx.dir });
    await expect(
      runRetrofitChecks({ plan, planPath, repoRoot: fx.dir, noRemoteCheck: true }),
    ).resolves.toBeUndefined();
  });

  it('throws TARGET_BRANCH_EXISTS when target branch exists locally', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git branch janus/retrofit', { cwd: fx.dir, stdio: 'pipe' });
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, '{}');
    const plan = samplePlan({ repo_root: fx.dir, target_branch: 'janus/retrofit' });
    await expectCode(
      runRetrofitChecks({ plan, planPath, repoRoot: fx.dir, noRemoteCheck: true }),
      'TARGET_BRANCH_EXISTS',
    );
  });

  it('throws HEAD_DETACHED when HEAD is not on a branch', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'seed.txt'), 'x');
    execSync('git add -A && git commit -m seed', { cwd: fx.dir, stdio: 'pipe' });
    execSync('git checkout --detach HEAD', { cwd: fx.dir, stdio: 'pipe' });
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, '{}');
    const plan = samplePlan({ repo_root: fx.dir });
    await expectCode(
      runRetrofitChecks({ plan, planPath, repoRoot: fx.dir, noRemoteCheck: true }),
      'HEAD_DETACHED',
    );
  });

  it('throws REMOTE_UNREACHABLE when ls-remote fails and noRemoteCheck is not set', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin file:///nonexistent/repo.git', { cwd: fx.dir, stdio: 'pipe' });
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, '{}');
    const plan = samplePlan({ repo_root: fx.dir });
    await expectCode(
      runRetrofitChecks({ plan, planPath, repoRoot: fx.dir, noRemoteCheck: false }),
      'REMOTE_UNREACHABLE',
    );
  });

  it('throws INVOKED_FROM_WORKTREE when run from a linked worktree', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'seed.txt'), 'x');
    execSync('git add -A && git commit -m seed', { cwd: fx.dir, stdio: 'pipe' });
    const wt = `${fx.dir}-wt`;
    execSync(`git worktree add ${wt} -b feature/x`, { cwd: fx.dir, stdio: 'pipe' });
    cleanups.push(() => {
      try {
        execSync(`git worktree remove --force ${wt}`, { cwd: fx.dir, stdio: 'pipe' });
      } catch {
        // best effort
      }
    });
    const planPath = join(wt, '.janus-retrofit.json');
    writeFileSync(planPath, '{}');
    const plan = samplePlan({ repo_root: wt });
    await expectCode(
      runRetrofitChecks({ plan, planPath, repoRoot: wt, noRemoteCheck: true }),
      'INVOKED_FROM_WORKTREE',
    );
  });
});
