import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import type { JanusError } from '../../errors.js';
import { runPostOverlayChecks } from './post-overlay-checks.js';

function captureError(fn: () => void): JanusError | undefined {
  try {
    fn();
  } catch (e) {
    return e as JanusError;
  }
  return undefined;
}

describe('runPostOverlayChecks (#6, #7)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('passes when no symlinks in target paths', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    expect(() => runPostOverlayChecks(fx.dir, new Set(['biome.jsonc']))).not.toThrow();
  });

  it('throws TARGET_PATH_SYMLINK when a target path resolves through a symlink', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.claude'));
    writeFileSync(join(fx.dir, '.claude/settings.json'), '{}');
    symlinkSync('settings.json', join(fx.dir, '.claude/settings-link.json'));
    const err = captureError(() =>
      runPostOverlayChecks(fx.dir, new Set(['.claude/settings-link.json'])),
    );
    expect(err?.code).toBe('TARGET_PATH_SYMLINK');
  });

  it('throws CASE_COLLISION when overlay path differs only by case from existing', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'README.md'), '# user');
    const err = captureError(() => runPostOverlayChecks(fx.dir, new Set(['readme.md'])));
    expect(err?.code).toBe('CASE_COLLISION');
  });
});
