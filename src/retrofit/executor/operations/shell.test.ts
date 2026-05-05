import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { applyShell } from './shell.js';

describe('applyShell', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('refuses commands not in the whitelist', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await expect(
      applyShell(
        // Non-whitelisted command — cast bypasses the type literal union for the test.
        { op: 'shell', command: 'echo hi' as never },
        { repoRoot: fx.dir },
      ),
    ).rejects.toMatchObject({ code: 'SHELL_NOT_WHITELISTED' });
  });

  it('runs whitelist entry `git config --unset core.hooksPath` and ignores exit code', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await expect(
      applyShell(
        { op: 'shell', command: 'git config --unset core.hooksPath' },
        { repoRoot: fx.dir },
      ),
    ).resolves.toBeUndefined();
  });
});
