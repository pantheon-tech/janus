import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import type { Plan } from '../types/index.js';
import { executeStep } from './step-driver.js';

type Step = Plan['payload']['steps'][number];

describe('executeStep', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('applies a single write_file op and commits', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const step: Step = {
      id: 'root-configs',
      category: 'apply-shared-overlay',
      title: 'configs',
      commit_message: 'chore: apply janus root configs',
      preconditions: [],
      operations: [{ op: 'write_file', path: 'biome.jsonc', content: '{}\n' }],
      commit_paths: ['biome.jsonc'],
    };
    const result = await executeStep(step, fx.dir);
    expect(result.status).toBe('committed');
    expect(existsSync(join(fx.dir, 'biome.jsonc'))).toBe(true);
  });

  it('skips when precondition fails', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const step: Step = {
      id: 'displace-eslint',
      category: 'displace-tools',
      title: '',
      commit_message: 'chore: e',
      preconditions: [{ type: 'file_exists', path: '.eslintrc.json' }],
      operations: [{ op: 'delete_file', path: '.eslintrc.json' }],
      commit_paths: [],
    };
    const result = await executeStep(step, fx.dir);
    expect(result.status).toBe('skipped');
  });

  it('does not bypass commit-msg hooks (no --no-verify)', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.git/hooks'), { recursive: true });
    writeFileSync(
      join(fx.dir, '.git/hooks/commit-msg'),
      '#!/bin/sh\necho "rejected by hook" >&2\nexit 1\n',
    );
    chmodSync(join(fx.dir, '.git/hooks/commit-msg'), 0o755);
    const step: Step = {
      id: 'root-configs',
      category: 'apply-shared-overlay',
      title: 'configs',
      commit_message: 'chore: apply janus root configs',
      preconditions: [],
      operations: [{ op: 'write_file', path: 'biome.jsonc', content: '{}\n' }],
      commit_paths: ['biome.jsonc'],
    };
    await expect(executeStep(step, fx.dir)).rejects.toThrow();
  });

  it('respects ignorePaths when checking for extraneous modifications', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    // Pre-existing untracked file (simulates the executor's plan file on disk).
    writeFileSync(join(fx.dir, '.janus-retrofit.json'), '{}');
    const step: Step = {
      id: 'root-configs',
      category: 'apply-shared-overlay',
      title: 'configs',
      commit_message: 'chore: apply janus root configs',
      preconditions: [],
      operations: [{ op: 'write_file', path: 'biome.jsonc', content: '{}\n' }],
      commit_paths: ['biome.jsonc'],
    };
    const result = await executeStep(step, fx.dir, {
      ignorePaths: new Set(['.janus-retrofit.json']),
    });
    expect(result.status).toBe('committed');
  });
});
