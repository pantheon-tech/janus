import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyzePackageManager } from './package-manager.js';
import { analyzePluginEvidence } from './plugin-evidence.js';

describe('analyzePluginEvidence', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('returns empty arrays on greenfield', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['frontend-design@claude-plugins-official']).toEqual([]);
    expect(ev['playwright@claude-plugins-official']).toEqual([]);
    expect(ev['pyright-lsp@claude-plugins-official']).toEqual([]);
  });

  it('detects frontend-design via vite.config.ts', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'vite.config.ts'), 'export default {}');
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['frontend-design@claude-plugins-official']).toContain('vite.config.ts');
  });

  it('detects frontend-design via react in dependencies', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(
      join(fx.dir, 'package.json'),
      JSON.stringify({ name: 'p', dependencies: { react: '^18' } }),
    );
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['frontend-design@claude-plugins-official']).toContain(
      'package.json:dependencies.react',
    );
  });

  it('detects playwright via playwright.config.ts + devDep', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'playwright.config.ts'), 'export default {}');
    writeFileSync(
      join(fx.dir, 'package.json'),
      JSON.stringify({ name: 'p', devDependencies: { '@playwright/test': '^1' } }),
    );
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['playwright@claude-plugins-official']).toEqual(
      expect.arrayContaining([
        'playwright.config.ts',
        'package.json:devDependencies.@playwright/test',
      ]),
    );
  });

  it('detects pyright-lsp via pyproject.toml', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['pyright-lsp@claude-plugins-official']).toContain('pyproject.toml');
  });

  it('does NOT detect pyright-lsp from a bare *.py at root', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'helper.py'), 'print("hi")');
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['pyright-lsp@claude-plugins-official']).toEqual([]);
  });
});
