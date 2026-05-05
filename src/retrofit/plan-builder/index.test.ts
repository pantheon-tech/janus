import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyze } from '../analyzer/index.js';
import { baselineDiff } from '../analyzer/baseline-diff.js';
import { resolvePlugins } from '../resolvers/plugins.js';
import { resolveSlots } from '../resolvers/slots.js';
import { validatePlan } from '../schema/validate.js';
import type { Archetype } from '../types/index.js';
import { buildPlan } from './index.js';
import { buildOverlayTree } from './overlay-tree.js';

const JANUS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('buildPlan', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('returns a Plan that validates against plan.schema.json (greenfield + generic-ts)', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan = await buildEndToEnd(fx.dir, 'generic-ts');
    const result = validatePlan(plan);
    expect(result.ok).toBe(true);
  });

  it('contains expected categories for an eslint-only repo', async () => {
    const fx = materializeFixture('eslint-only');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan = await buildEndToEnd(fx.dir, 'generic-ts');
    const cats = new Set(plan.payload.steps.map((s) => s.category));
    expect(cats).toContain('displace-tools');
    expect(cats).toContain('apply-shared-overlay');
    expect(cats).toContain('install-deps');
    expect(cats).toContain('write-marker');
  });

  it('skips install-deps for monorepo-root archetype', async () => {
    const fx = materializeFixture('monorepo');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan = await buildEndToEnd(fx.dir, 'monorepo-root');
    expect(plan.payload.steps.find((s) => s.id === 'install-deps')).toBeUndefined();
  });

  it('produces byte-stable payload across two runs (determinism contract)', async () => {
    const fx = materializeFixture('eslint-only');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan1 = await buildEndToEnd(fx.dir, 'generic-ts');
    const plan2 = await buildEndToEnd(fx.dir, 'generic-ts');
    expect(JSON.stringify(plan1.payload)).toBe(JSON.stringify(plan2.payload));
  });
});

async function buildEndToEnd(repoRoot: string, archetype: Archetype) {
  const snapshot = analyze(repoRoot);
  const slots = await resolveSlots({
    snapshot,
    archetype,
    cliSlots: { author: 'T', author_email: 't@e.com', description: 'd' },
    nonInteractive: true,
    now: new Date('2026-05-05T00:00:00Z'),
    janusVersion: '0.1.0',
  });
  const plugins = await resolvePlugins({
    pluginEvidence: snapshot.plugin_evidence,
    cliAdd: [],
    cliRemove: [],
    nonInteractive: true,
  });
  const overlay = buildOverlayTree(JANUS_ROOT, archetype, slots);
  const baseline = baselineDiff(repoRoot, overlay.tree);
  const fullSnapshot = { ...snapshot, baseline_files: baseline };
  return buildPlan({
    snapshot: fullSnapshot,
    overlay,
    slots,
    plugins,
    archetype,
    janusVersion: '0.1.0',
    targetBranch: 'janus/retrofit',
    now: new Date('2026-05-05T00:00:00Z'),
    has_user_gitignore: existsSync(join(repoRoot, '.gitignore')),
  });
}
