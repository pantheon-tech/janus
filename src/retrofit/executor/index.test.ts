import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { diagnose } from '../plan-builder/diagnose.js';
import { execute } from './index.js';

const JANUS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('execute (end-to-end on greenfield + generic-ts)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('runs pre-flight, checks out branch, applies steps, writes marker', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });

    const plan = await diagnose({
      repoRoot: fx.dir,
      archetype: 'generic-ts',
      cliSlots: { author: 'T', author_email: 't@e.com', description: 'd' },
      now: new Date('2026-05-05T00:00:00Z'),
      janusRoot: JANUS_ROOT,
    });
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, JSON.stringify(plan, null, 2));

    const report = await execute(plan, fx.dir, {
      planPath,
      noRemoteCheck: true,
      now: new Date('2026-05-05T01:00:00Z'),
    });
    expect(report.committed.length).toBeGreaterThan(0);
    expect(existsSync(join(fx.dir, '.janus.json'))).toBe(true);
    expect(existsSync(join(fx.dir, 'biome.jsonc'))).toBe(true);
  }, 120_000);

  it('--dry-run runs pre-flight without changes', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });

    const plan = await diagnose({
      repoRoot: fx.dir,
      archetype: 'generic-ts',
      cliSlots: { author: 'T', author_email: 't@e.com', description: 'd' },
      now: new Date('2026-05-05T00:00:00Z'),
      janusRoot: JANUS_ROOT,
    });
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, JSON.stringify(plan, null, 2));

    const before = execSync('git rev-parse HEAD', { cwd: fx.dir }).toString();
    await execute(plan, fx.dir, { planPath, noRemoteCheck: true, dryRun: true });
    const after = execSync('git rev-parse HEAD', { cwd: fx.dir }).toString();
    expect(before).toBe(after);
    expect(existsSync(join(fx.dir, 'biome.jsonc'))).toBe(false);
  });
});
