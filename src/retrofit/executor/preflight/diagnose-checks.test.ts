import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { runDiagnoseChecks } from './diagnose-checks.js';

describe('runDiagnoseChecks (#1–#5, #8)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('passes for greenfield + valid archetype', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await expect(runDiagnoseChecks(fx.dir, 'generic-ts')).resolves.toBeUndefined();
  });

  it('throws INVALID_ARCHETYPE for invalid archetype', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await expect(runDiagnoseChecks(fx.dir, 'wat')).rejects.toMatchObject({
      code: 'INVALID_ARCHETYPE',
    });
  });

  it('throws NOT_IN_GIT_REPO outside a repo', async () => {
    await expect(runDiagnoseChecks('/tmp', 'generic-ts')).rejects.toMatchObject({
      code: 'NOT_IN_GIT_REPO',
    });
  });

  it('throws HAS_SUBMODULES when .gitmodules has entries', async () => {
    const fx = materializeFixture('repo-with-submodule');
    cleanups.push(fx.cleanup);
    await expect(runDiagnoseChecks(fx.dir, 'generic-ts')).rejects.toMatchObject({
      code: 'HAS_SUBMODULES',
    });
  });

  it('throws MARKER_INVALID when .janus.json is unparseable', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, '.janus.json'), 'not json');
    await expect(runDiagnoseChecks(fx.dir, 'generic-ts')).rejects.toMatchObject({
      code: 'MARKER_INVALID',
    });
  });

  it('passes when .janus.json is valid', async () => {
    const fx = materializeFixture('already-janus');
    cleanups.push(fx.cleanup);
    await expect(runDiagnoseChecks(fx.dir, 'generic-ts')).resolves.toBeUndefined();
  });

  it('throws INVOKED_FROM_WORKSPACE_MEMBER when monorepo-root invoked from a member', async () => {
    const fx = materializeFixture('monorepo');
    cleanups.push(fx.cleanup);
    const member = join(fx.dir, 'packages/api');
    mkdirSync(member, { recursive: true });
    writeFileSync(join(member, 'package.json'), '{"name":"@x/api"}');
    await expect(runDiagnoseChecks(member, 'monorepo-root')).rejects.toMatchObject({
      code: 'INVOKED_FROM_WORKSPACE_MEMBER',
    });
  });
});
