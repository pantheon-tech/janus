import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyzeDisplacedTools } from './displaced-tools.js';
import { analyzePackageManager } from './package-manager.js';

describe('analyzeDisplacedTools', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('detects eslint via .eslintrc.json + devDep', () => {
    const fx = materializeFixture('eslint-only');
    cleanups.push(fx.cleanup);
    const pm = analyzePackageManager(fx.dir);
    const tools = analyzeDisplacedTools(fx.dir, pm.package_json);
    const eslint = tools.find((t) => t.name === 'eslint');
    expect(eslint).toBeDefined();
    expect(eslint!.evidence).toContain('.eslintrc.json');
    expect(eslint!.evidence).toContain('package.json:devDependencies.eslint');
  });

  it('detects prettier and husky together', () => {
    const fx = materializeFixture('prettier-husky');
    cleanups.push(fx.cleanup);
    const pm = analyzePackageManager(fx.dir);
    const tools = analyzeDisplacedTools(fx.dir, pm.package_json);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['husky', 'prettier']);

    const husky = tools.find((t) => t.name === 'husky')!;
    expect(husky.evidence).toContain('.husky/');
    expect(husky.evidence).toContain('package.json:devDependencies.husky');

    const prettier = tools.find((t) => t.name === 'prettier')!;
    expect(prettier.evidence).toContain('.prettierrc');
  });

  it('detects jest via config + devDep', () => {
    const fx = materializeFixture('npm-with-jest');
    cleanups.push(fx.cleanup);
    const pm = analyzePackageManager(fx.dir);
    const tools = analyzeDisplacedTools(fx.dir, pm.package_json);
    const jest = tools.find((t) => t.name === 'jest');
    expect(jest).toBeDefined();
    expect(jest!.evidence).toContain('jest.config.js');
    expect(jest!.evidence).toContain('package.json:devDependencies.jest');
  });

  it('returns empty for greenfield', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const pm = analyzePackageManager(fx.dir);
    expect(analyzeDisplacedTools(fx.dir, pm.package_json)).toEqual([]);
  });
});
