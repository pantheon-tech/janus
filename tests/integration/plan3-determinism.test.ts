import { execSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { diagnose } from '../../src/retrofit/plan-builder/diagnose.js';
import { hashPayload } from '../../src/retrofit/plan-builder/determinism.js';
import { validatePlan } from '../../src/retrofit/schema/validate.js';
import { materializeFixture } from '../helpers/fixture-repo.js';

const CASES: Array<{ fixture: string; archetype: string }> = [
  { fixture: 'greenfield', archetype: 'generic-ts' },
  { fixture: 'eslint-only', archetype: 'generic-ts' },
  { fixture: 'prettier-husky', archetype: 'generic-ts' },
  { fixture: 'monorepo', archetype: 'monorepo-root' },
  { fixture: 'commonjs-repo', archetype: 'generic-ts' },
];

describe('Plan 3 determinism: per fixture × archetype', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  for (const { fixture, archetype } of CASES) {
    it(`${fixture} + ${archetype}: schema-valid + payload byte-stable across two runs`, async () => {
      const fx = materializeFixture(fixture);
      cleanups.push(fx.cleanup);
      const repoName = fixture.replace(/[-_]/g, '').slice(0, 12);
      execSync(`git remote add origin https://github.com/test-org/${repoName}.git`, {
        cwd: fx.dir,
        stdio: 'pipe',
      });
      const cliSlots = {
        author: 'Test',
        author_email: 'test@example.com',
        description: 'A test',
      };
      const now = new Date('2026-05-05T00:00:00Z');
      const plan1 = await diagnose({ repoRoot: fx.dir, archetype, cliSlots, now });
      const plan2 = await diagnose({ repoRoot: fx.dir, archetype, cliSlots, now });

      expect(validatePlan(plan1).ok).toBe(true);
      expect(hashPayload(plan1.payload)).toBe(hashPayload(plan2.payload));
    });
  }

  it('apply-shared-overlay/root-dotfiles strictly precedes install-deps (load-bearing ordering)', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan = await diagnose({
      repoRoot: fx.dir,
      archetype: 'generic-ts',
      cliSlots: { author: 'T', author_email: 't@e.com', description: 'd' },
      now: new Date('2026-05-05T00:00:00Z'),
    });
    const ids = plan.payload.steps.map((s) => s.id);
    const dotfilesIdx = ids.indexOf('root-dotfiles');
    const installIdx = ids.indexOf('install-deps');
    expect(dotfilesIdx).toBeGreaterThanOrEqual(0);
    expect(installIdx).toBeGreaterThan(dotfilesIdx);
  });

  it('set-package-manager strictly precedes install-deps when present', async () => {
    const fx = materializeFixture('npm-with-jest');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan = await diagnose({
      repoRoot: fx.dir,
      archetype: 'generic-ts',
      cliSlots: { author: 'T', author_email: 't@e.com', description: 'd' },
      now: new Date('2026-05-05T00:00:00Z'),
    });
    const ids = plan.payload.steps.map((s) => s.id);
    const setIdx = ids.indexOf('set-package-manager');
    const installIdx = ids.indexOf('install-deps');
    expect(setIdx).toBeGreaterThanOrEqual(0);
    expect(installIdx).toBeGreaterThan(setIdx);
  });
});
