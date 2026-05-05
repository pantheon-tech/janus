import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyzePackageManager } from './package-manager.js';

describe('analyzePackageManager', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('detects npm via package-lock.json', () => {
    const fx = materializeFixture('npm-with-jest');
    cleanups.push(fx.cleanup);
    const r = analyzePackageManager(fx.dir);
    expect(r.package_manager).toBe('npm');
    expect(r.lockfiles_present).toEqual(['package-lock.json']);
    expect(r.has_package_json).toBe(true);
    expect(r.package_json?.devDependencies?.jest).toBe('^29.0.0');
    expect(r.workspace).toBeUndefined();
  });

  it('returns has_package_json: false when missing', () => {
    const fx = materializeFixture('repo-without-package-json');
    cleanups.push(fx.cleanup);
    const r = analyzePackageManager(fx.dir);
    expect(r.has_package_json).toBe(false);
    expect(r.package_json).toBeUndefined();
    expect(r.package_manager).toBe('none');
    expect(r.lockfiles_present).toEqual([]);
  });

  it('detects pnpm via packageManager field even without lockfile', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(
      join(fx.dir, 'package.json'),
      JSON.stringify({ name: 'p', packageManager: 'pnpm@9.7.0' }),
    );
    const r = analyzePackageManager(fx.dir);
    expect(r.package_manager).toBe('pnpm');
  });

  it('detects pnpm-lock.yaml in priority over packageManager field absence', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'package.json'), JSON.stringify({ name: 'p' }));
    writeFileSync(join(fx.dir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"');
    const r = analyzePackageManager(fx.dir);
    expect(r.package_manager).toBe('pnpm');
    expect(r.lockfiles_present).toEqual(['pnpm-lock.yaml']);
  });

  it('detects pnpm workspace', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'package.json'), JSON.stringify({ name: 'root' }));
    writeFileSync(
      join(fx.dir, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n  - 'apps/*'\n",
    );
    const r = analyzePackageManager(fx.dir);
    expect(r.workspace).toEqual({ type: 'pnpm', packages: ['packages/*', 'apps/*'] });
  });

  it('returns "none" with no package.json and no lockfile', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const r = analyzePackageManager(fx.dir);
    expect(r.package_manager).toBe('none');
  });
});
