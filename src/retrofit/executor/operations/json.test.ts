import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { applyJsonRemove, applyJsonRemoveMatching, applyJsonSet } from './json.js';

const writePkg = (dir: string, obj: unknown) =>
  writeFileSync(join(dir, 'package.json'), JSON.stringify(obj, null, 2));
const readPkg = (dir: string) =>
  JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown> & {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

describe('json ops', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('json_set creates the path if missing', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writePkg(fx.dir, { name: 'p' });
    applyJsonSet(
      { op: 'json_set', path: 'package.json', pointer: '/scripts/lint', value: 'biome check' },
      { repoRoot: fx.dir },
    );
    expect(readPkg(fx.dir).scripts?.lint).toBe('biome check');
  });

  it('json_remove removes the pointed-at key', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writePkg(fx.dir, { devDependencies: { eslint: '^8' } });
    applyJsonRemove(
      { op: 'json_remove', path: 'package.json', pointer: '/devDependencies/eslint' },
      { repoRoot: fx.dir },
    );
    expect(readPkg(fx.dir).devDependencies?.eslint).toBeUndefined();
  });

  it('json_remove no-ops when pointer missing', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writePkg(fx.dir, {});
    expect(() =>
      applyJsonRemove(
        { op: 'json_remove', path: 'package.json', pointer: '/x' },
        { repoRoot: fx.dir },
      ),
    ).not.toThrow();
  });

  it('json_remove_matching: value_regex form', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writePkg(fx.dir, { scripts: { lint: 'eslint .', build: 'tsc' } });
    applyJsonRemoveMatching(
      {
        op: 'json_remove_matching',
        path: 'package.json',
        pointer: '/scripts',
        value_regex: 'eslint',
      },
      { repoRoot: fx.dir },
    );
    expect(readPkg(fx.dir).scripts?.lint).toBeUndefined();
    expect(readPkg(fx.dir).scripts?.build).toBe('tsc');
  });

  it('json_remove_matching: key_regex form', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writePkg(fx.dir, { scripts: { prepare: 'husky', postinstall: 'husky', test: 'jest' } });
    applyJsonRemoveMatching(
      {
        op: 'json_remove_matching',
        path: 'package.json',
        pointer: '/scripts',
        key_regex: '^(prepare|postinstall)$',
      },
      { repoRoot: fx.dir },
    );
    const pkg = readPkg(fx.dir);
    expect(pkg.scripts?.prepare).toBeUndefined();
    expect(pkg.scripts?.postinstall).toBeUndefined();
    expect(pkg.scripts?.test).toBe('jest');
  });
});
