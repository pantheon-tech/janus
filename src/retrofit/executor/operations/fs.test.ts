import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import type { JanusError } from '../../errors.js';
import { applyChmod, applyDeleteDirectory, applyDeleteFile, applyRenameFile } from './fs.js';

function captureCode(fn: () => void): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as JanusError).code;
  }
  return undefined;
}

describe('fs ops', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('delete_file: removes existing file', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'x'), '');
    applyDeleteFile({ op: 'delete_file', path: 'x' }, { repoRoot: fx.dir });
    expect(existsSync(join(fx.dir, 'x'))).toBe(false);
  });

  it('delete_file: silent no-op when missing without pre_state_hash', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    expect(() =>
      applyDeleteFile({ op: 'delete_file', path: 'gone' }, { repoRoot: fx.dir }),
    ).not.toThrow();
  });

  it('delete_file: PRE_STATE_HASH_MISSING_FILE when missing AND pre_state_hash set', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const code = captureCode(() =>
      applyDeleteFile(
        { op: 'delete_file', path: 'gone', pre_state_hash: 'sha256:00' },
        { repoRoot: fx.dir },
      ),
    );
    expect(code).toBe('PRE_STATE_HASH_MISSING_FILE');
  });

  it('delete_directory: recursive removes; no-op if missing', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.husky/_'), { recursive: true });
    writeFileSync(join(fx.dir, '.husky/_/husky.sh'), 'x');
    applyDeleteDirectory({ op: 'delete_directory', path: '.husky' }, { repoRoot: fx.dir });
    expect(existsSync(join(fx.dir, '.husky'))).toBe(false);
    expect(() =>
      applyDeleteDirectory({ op: 'delete_directory', path: '.husky' }, { repoRoot: fx.dir }),
    ).not.toThrow();
  });

  it('rename_file: moves source → dest', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'CLAUDE.md'), 'user');
    applyRenameFile(
      { op: 'rename_file', from: 'CLAUDE.md', to: 'CLAUDE.pre-janus.md' },
      { repoRoot: fx.dir },
    );
    expect(existsSync(join(fx.dir, 'CLAUDE.md'))).toBe(false);
    expect(existsSync(join(fx.dir, 'CLAUDE.pre-janus.md'))).toBe(true);
  });

  it('chmod: sets mode', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'a.sh'), '#!/bin/sh');
    applyChmod({ op: 'chmod', path: 'a.sh', mode: 0o755 }, { repoRoot: fx.dir });
    expect(statSync(join(fx.dir, 'a.sh')).mode & 0o777).toBe(0o755);
  });
});
