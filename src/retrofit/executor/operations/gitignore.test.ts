import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import type { JanusError } from '../../errors.js';
import { applyGitignoreMerge } from './gitignore.js';

const BEGIN = '# --- janus baseline (managed by janus retrofit; do not edit) ---';
const END = '# --- end janus baseline ---';

function captureCode(fn: () => void): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as JanusError).code;
  }
  return undefined;
}

describe('applyGitignoreMerge', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('appends a new janus block at end when markers absent', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, '.gitignore'), 'node_modules_user/\nlogs/\n');
    applyGitignoreMerge(
      { op: 'gitignore_merge', lines: ['node_modules/', '.env'] },
      { repoRoot: fx.dir },
    );
    const out = readFileSync(join(fx.dir, '.gitignore'), 'utf8');
    expect(out).toContain('node_modules_user/');
    expect(out).toContain(BEGIN);
    expect(out).toContain('node_modules/');
    expect(out).toContain('.env');
    expect(out).toContain(END);
  });

  it('replaces block body when markers present (idempotent)', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, '.gitignore'), `keep/\n${BEGIN}\nold-line\n${END}\nmore/\n`);
    applyGitignoreMerge(
      { op: 'gitignore_merge', lines: ['new-line', 'another'] },
      { repoRoot: fx.dir },
    );
    const out = readFileSync(join(fx.dir, '.gitignore'), 'utf8');
    expect(out).toContain('keep/');
    expect(out).toContain('new-line');
    expect(out).toContain('another');
    expect(out).not.toContain('old-line');
    expect(out).toContain('more/');
  });

  it('aborts GITIGNORE_BLOCK_MALFORMED when only one marker present', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, '.gitignore'), `${BEGIN}\nbroken\n`);
    const code = captureCode(() =>
      applyGitignoreMerge({ op: 'gitignore_merge', lines: ['x'] }, { repoRoot: fx.dir }),
    );
    expect(code).toBe('GITIGNORE_BLOCK_MALFORMED');
  });
});
