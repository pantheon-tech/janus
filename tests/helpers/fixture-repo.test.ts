import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from './fixture-repo.js';

describe('materializeFixture', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('copies the fixture tree into a fresh temp dir', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);

    expect(fx.dir).toMatch(/^\/tmp\/janus-fixture-/);
    expect(existsSync(join(fx.dir, '.git'))).toBe(true);
  });

  it('initializes git with an initial commit on a default branch', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);

    const head = readFileSync(join(fx.dir, '.git', 'HEAD'), 'utf8').trim();
    expect(head).toMatch(/^ref: refs\/heads\/\w+/);
  });

  it('cleanup removes the temp dir', () => {
    const fx = materializeFixture('greenfield');
    fx.cleanup();
    expect(existsSync(fx.dir)).toBe(false);
  });

  it('throws if the fixture name is unknown', () => {
    expect(() => materializeFixture('nonexistent-fixture-xyz')).toThrow(/fixture/i);
  });

  it('materializes submodule fixture and runs setup.sh', () => {
    const fx = materializeFixture('repo-with-submodule');
    cleanups.push(fx.cleanup);
    expect(existsSync(join(fx.dir, '.gitmodules'))).toBe(true);
  });

  it('materializes symlink fixture', () => {
    const fx = materializeFixture('repo-with-symlink');
    cleanups.push(fx.cleanup);
    expect(existsSync(join(fx.dir, 'link.txt'))).toBe(true);
  });
});
