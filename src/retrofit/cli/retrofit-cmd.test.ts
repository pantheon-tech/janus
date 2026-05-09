import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../executor/index.js', () => ({
  execute: vi.fn(),
}));

import { JanusError } from '../errors.js';
import { execute } from '../executor/index.js';
import { runRetrofit } from './retrofit-cmd.js';

const baseSlots = {
  workload: 'foo',
  description: 'd',
  archetype: 'generic-ts',
  github_org: 'test',
  author: 'Test',
  author_email: 't@e.com',
  node_version: '24',
  license: 'MIT',
  region: 'australiaeast',
  template_version: 'v0.1.0',
  year: '2026',
  date: '2026-05-05',
  base_branch: 'main',
};

function writePlan(
  steps: Array<{ id: string; title: string; ops: number; commit_paths: string[] }>,
): string {
  const dir = mkdtempSync(join(tmpdir(), 'rcmd-'));
  const path = join(dir, 'plan.json');
  const plan = {
    schema_version: '1',
    meta: { janus_version: '0.1.0', generated_at: '2026-05-05T00:00:00Z' },
    payload: {
      repo_root: dir,
      archetype: 'generic-ts',
      target_branch: 'janus/retrofit',
      slots: baseSlots,
      plugins: [],
      prior_marker: null,
      warnings: [],
      steps: steps.map((s) => ({
        id: s.id,
        category: 'install-deps' as const,
        title: s.title,
        commit_message: 'chore: x',
        preconditions: [],
        operations: Array.from({ length: s.ops }, () => ({
          op: 'shell' as const,
          command: 'pnpm install' as const,
        })),
        commit_paths: s.commit_paths,
      })),
    },
  };
  writeFileSync(path, JSON.stringify(plan));
  return path;
}

describe('runRetrofit exit-code mapping', () => {
  afterEach(() => vi.mocked(execute).mockReset());

  it('returns 2 with last-good-sha message when execute() throws a MID_EXECUTION JanusError', async () => {
    const plan = writePlan([{ id: 's1', title: 't', ops: 1, commit_paths: [] }]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(execute).mockRejectedValueOnce(
      new JanusError(
        'EXTRANEOUS_FILE_MODIFICATIONS',
        'shell op failed at step displace-eslint. Last-good sha=abc1234. Recover with: git reset --hard abc1234',
      ),
    );
    const code = await runRetrofit(['--plan', plan, '--no-remote-check']);
    expect(code).toBe(2);
    const output = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(output.toLowerCase()).toContain('last-good');
    errSpy.mockRestore();
  });

  it('returns 1 when execute() throws a non-MID_EXECUTION JanusError', async () => {
    const plan = writePlan([{ id: 's1', title: 't', ops: 1, commit_paths: [] }]);
    vi.mocked(execute).mockRejectedValueOnce(new JanusError('TREE_DIRTY', 'worktree dirty'));
    const code = await runRetrofit(['--plan', plan, '--no-remote-check']);
    expect(code).toBe(1);
  });

  it('returns 3 when execute() throws a non-JanusError', async () => {
    const plan = writePlan([{ id: 's1', title: 't', ops: 1, commit_paths: [] }]);
    vi.mocked(execute).mockRejectedValueOnce(new TypeError('boom'));
    const code = await runRetrofit(['--plan', plan, '--no-remote-check']);
    expect(code).toBe(3);
  });
});

describe('runRetrofit --dry-run per-step summary', () => {
  afterEach(() => vi.mocked(execute).mockReset());

  it('prints one block per step with id, title, ops count, commit_paths', async () => {
    const plan = writePlan([
      {
        id: 'displace-eslint',
        title: 'remove eslint',
        ops: 2,
        commit_paths: ['.eslintrc.json', 'package.json'],
      },
      { id: 'install-deps', title: 'pnpm install', ops: 1, commit_paths: ['pnpm-lock.yaml'] },
    ]);
    vi.mocked(execute).mockResolvedValueOnce({
      branch: 'janus/retrofit',
      total_steps: 2,
      committed: [],
      skipped: [],
      empty: [],
      warnings_count: 0,
      last_good_sha: null,
    } as never);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runRetrofit(['--plan', plan, '--dry-run', '--no-remote-check']);
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(out).toContain('Step 1: displace-eslint');
    expect(out).toContain('title: remove eslint');
    expect(out).toContain('ops: 2');
    expect(out).toContain('commit_paths: [.eslintrc.json, package.json]');
    expect(out).toContain('Step 2: install-deps');
    expect(out).toContain('commit_paths: [pnpm-lock.yaml]');
    logSpy.mockRestore();
  });
});
