import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyze } from './index.js';

describe('analyze', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('returns a snapshot with all top-level fields populated for greenfield', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const snap = analyze(fx.dir);
    expect(snap.repo_root).toBe(fx.dir);
    expect(snap.has_janus_marker).toBe(false);
    expect(snap.prior_marker).toBeUndefined();
    expect(snap.package_manager).toBe('none');
    expect(snap.has_package_json).toBe(false);
    expect(snap.displaced_tools).toEqual([]);
    expect(snap.claude_kit.has_claude_dir).toBe(false);
    expect(snap.ci_workflows).toEqual([]);
    expect(snap.git.head_branch).toBe('main');
  });

  it('reads .janus.json when present and populates prior_marker', () => {
    const fx = materializeFixture('already-janus');
    cleanups.push(fx.cleanup);
    const snap = analyze(fx.dir);
    expect(snap.has_janus_marker).toBe(true);
    expect(snap.prior_marker?.archetype).toBe('generic-ts');
    expect(snap.prior_marker?.slots.workload).toBe('alreadyjanus');
  });

  it('lists workflow files under .github/workflows/', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.github/workflows'), { recursive: true });
    writeFileSync(
      join(fx.dir, '.github/workflows/qa.yml'),
      'name: qa\non: push\njobs:\n  q:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci && eslint .\n',
    );
    writeFileSync(
      join(fx.dir, '.github/workflows/build.yml'),
      'name: build\njobs:\n  b:\n    steps: []\n',
    );
    const snap = analyze(fx.dir);
    const paths = snap.ci_workflows.map((w) => w.path).sort();
    expect(paths).toEqual(['.github/workflows/build.yml', '.github/workflows/qa.yml']);
    const qa = snap.ci_workflows.find((w) => w.path === '.github/workflows/qa.yml')!;
    expect(qa.references_displaced_tool).toEqual(expect.arrayContaining(['eslint', 'npm']));
  });

  it('detects unrecognized_tools using the hardcoded fallback when no allowlist opt is provided', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(
      join(fx.dir, 'package.json'),
      JSON.stringify({
        name: 'p',
        devDependencies: { 'lint-staged': '^15.0.0', 'biome-not-real-tool': '^1' },
      }),
    );
    const snap = analyze(fx.dir);
    expect(snap.unrecognized_tools).toContain('lint-staged');
    expect(snap.unrecognized_tools).not.toContain('biome-not-real-tool');
  });

  it('uses the unrecognizedToolsAllowlist opt when provided (overrides hardcoded fallback)', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(
      join(fx.dir, 'package.json'),
      JSON.stringify({
        name: 'p',
        devDependencies: { 'lint-staged': '^15.0.0', 'custom-tool': '^1' },
      }),
    );
    const snap = analyze(fx.dir, { unrecognizedToolsAllowlist: ['custom-tool'] });
    expect(snap.unrecognized_tools).toContain('custom-tool');
    expect(snap.unrecognized_tools).not.toContain('lint-staged');
  });
});
