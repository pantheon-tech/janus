import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { analyze } from '../../src/retrofit/analyzer/index.js';
import { baselineDiff } from '../../src/retrofit/analyzer/baseline-diff.js';
import { buildOverlayTree } from '../../src/retrofit/plan-builder/overlay-tree.js';
import { resolvePlugins } from '../../src/retrofit/resolvers/plugins.js';
import { resolveSlots } from '../../src/retrofit/resolvers/slots.js';
import { materializeFixture } from '../helpers/fixture-repo.js';

const JANUS_ROOT = fileURLToPath(new URL('../../', import.meta.url));

describe('Plan 2 end-to-end', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('produces a coherent snapshot+slots+plugins+overlay+baseline for eslint-only fixture', async () => {
    const fx = materializeFixture('eslint-only');
    cleanups.push(fx.cleanup);

    // Use a workload-friendly remote name (`eslintonly` passes the workload regex; `eslint-only` would not).
    execSync('git remote add origin https://github.com/test-org/eslintonly.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });

    // 1. Analyze.
    const snapshot = analyze(fx.dir);
    expect(snapshot.displaced_tools.find((t) => t.name === 'eslint')).toBeDefined();
    expect(snapshot.remote.parsed?.repo).toBe('eslintonly');

    // 2. Resolve slots (non-interactive; author/email come from --slot since fixture has none).
    const slots = await resolveSlots({
      snapshot,
      archetype: 'generic-ts',
      cliSlots: {
        author: 'Test Author',
        author_email: 'test@example.com',
        description: 'A test repo',
      },
      nonInteractive: true,
      now: new Date('2026-05-05T00:00:00Z'),
      janusVersion: '0.1.0',
    });
    expect(slots.workload).toBe('eslintonly');
    expect(slots.github_org).toBe('test-org');

    // 3. Resolve plugins (no plugin evidence in fixture).
    const plugins = await resolvePlugins({
      pluginEvidence: snapshot.plugin_evidence,
      cliAdd: [],
      cliRemove: [],
      nonInteractive: true,
    });
    expect(plugins).toEqual([]);

    // 4. Build overlay tree.
    const overlay = buildOverlayTree(JANUS_ROOT, 'generic-ts', slots);
    expect(overlay.tree.size).toBeGreaterThan(0);
    expect(overlay.gitignore_lines.length).toBeGreaterThan(0);
    expect(overlay.archetype_only).toBeInstanceOf(Set);

    // 5. Baseline diff.
    const diff = baselineDiff(fx.dir, overlay.tree);
    const pkg = diff.find((d) => d.path === 'package.json');
    expect(pkg?.status).toBe('present_differs');
    const biome = diff.find((d) => d.path === 'biome.jsonc');
    expect(biome?.status).toBe('missing');

    // 6. archetype_only contract check using a real archetype (backend-functions).
    const beOverlay = buildOverlayTree(JANUS_ROOT, 'backend-functions', slots);
    expect(beOverlay.archetype_only.size).toBeGreaterThan(0);
    for (const path of beOverlay.archetype_only) {
      expect(beOverlay.tree.has(path)).toBe(true);
    }
  });
});
