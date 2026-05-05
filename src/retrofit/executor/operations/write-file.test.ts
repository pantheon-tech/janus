import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { applyWriteFile } from './write-file.js';

const sha256 = (s: string): `sha256:${string}` =>
  `sha256:${createHash('sha256').update(s, 'utf8').digest('hex')}`;

describe('applyWriteFile', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('creates a missing file', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await applyWriteFile(
      { op: 'write_file', path: 'biome.jsonc', content: '{}\n' },
      { repoRoot: fx.dir },
    );
    expect(readFileSync(join(fx.dir, 'biome.jsonc'), 'utf8')).toBe('{}\n');
  });

  it('refuses to overwrite without overwrite: true', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'a.txt'), 'old');
    await expect(
      applyWriteFile({ op: 'write_file', path: 'a.txt', content: 'new' }, { repoRoot: fx.dir }),
    ).rejects.toMatchObject({ code: 'PRE_STATE_HASH_MISMATCH' });
  });

  it('overwrites with overwrite: true and matching pre_state_hash', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'a.txt'), 'old');
    await applyWriteFile(
      {
        op: 'write_file',
        path: 'a.txt',
        content: 'new',
        overwrite: true,
        pre_state_hash: sha256('old'),
      },
      { repoRoot: fx.dir },
    );
    expect(readFileSync(join(fx.dir, 'a.txt'), 'utf8')).toBe('new');
  });

  it('aborts with PRE_STATE_HASH_MISMATCH when file changed since plan', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'a.txt'), 'changed');
    await expect(
      applyWriteFile(
        {
          op: 'write_file',
          path: 'a.txt',
          content: 'new',
          overwrite: true,
          pre_state_hash: sha256('plan-time-content'),
        },
        { repoRoot: fx.dir },
      ),
    ).rejects.toMatchObject({ code: 'PRE_STATE_HASH_MISMATCH' });
  });

  it('applies mode', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await applyWriteFile(
      { op: 'write_file', path: 'foo.sh', content: '#!/bin/sh\n', mode: 0o755 },
      { repoRoot: fx.dir },
    );
    expect(statSync(join(fx.dir, 'foo.sh')).mode & 0o777).toBe(0o755);
  });
});
