import { describe, expect, it } from 'vitest';
import type { Plan } from '../types/index.js';
import { formatDiagnoseSummary } from './format-diagnose-summary.js';

const baseSlots = {
  workload: 'foo',
  description: 'd',
  archetype: 'backend-functions',
  github_org: 'pantheon-tech',
  author: 'Daniel',
  author_email: 'd@e.com',
  node_version: '24',
  license: 'MIT',
  region: 'australiaeast',
  template_version: 'v0.1.0',
  year: '2026',
  date: '2026-05-05',
  base_branch: 'staging',
} as const;

const HASH = 'sha256:abcdef0123456789aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function makePlan(overrides: Partial<Plan['payload']> = {}): Plan {
  return {
    schema_version: '1',
    meta: { janus_version: '0.1.0', generated_at: '2026-05-05T00:00:00Z' },
    payload: {
      repo_root: '/x',
      archetype: 'backend-functions',
      target_branch: 'janus/retrofit',
      slots: { ...baseSlots },
      plugins: ['frontend-design@claude-plugins-official'],
      prior_marker: null,
      warnings: [
        { code: 'MODULE_TYPE_CHANGE', message: 'pkg type cjs → module', evidence: ['package.json:type'] },
      ],
      steps: [],
      ...overrides,
    },
  };
}

describe('formatDiagnoseSummary', () => {
  it('emits a canonical summary with overwrite + merge blocks (snapshot)', () => {
    const plan = makePlan({
      steps: [
        {
          id: 'apply-shared-overlay',
          category: 'apply-overlay',
          title: '',
          commit_message: 'chore: o',
          preconditions: [],
          operations: [
            { op: 'write_file', path: 'biome.jsonc', content: '{}', pre_state_hash: HASH },
            { op: 'write_file', path: 'package.json', content: '{}', pre_state_hash: HASH },
            { op: 'claude_settings_merge', additions: {}, pre_state_hash: HASH },
            { op: 'gitignore_merge', lines: ['dist\n'], pre_state_hash: HASH },
          ],
          commit_paths: ['biome.jsonc', 'package.json', '.claude/settings.json', '.gitignore'],
        },
      ],
    });
    const out = formatDiagnoseSummary(plan, '/tmp/x.json');
    const expected = [
      'janus diagnose v0.1.0 — backend-functions archetype',
      '',
      'Plan: 1 steps (1 apply-overlay)',
      'Slots: workload=foo, archetype=backend-functions, github_org=pantheon-tech, author=Daniel <d@e.com>, node=24, region=australiaeast',
      'Plugins: frontend-design',
      '',
      'Warnings: 1',
      '  - MODULE_TYPE_CHANGE: pkg type cjs → module (package.json:type)',
      '',
      'Files to be overwritten (1):',
      '  biome.jsonc                  sha256:abcdef012345… → janus',
      '',
      'Files to be merged (3, additive — user content preserved):',
      '  package.json                 sha256:abcdef012345… → jq deep-merge',
      '  .claude/settings.json        sha256:abcdef012345… → settings merge per §8',
      '  .gitignore                   sha256:abcdef012345… → janus baseline block',
      '',
      'Plan written to /tmp/x.json',
      'Next: review the plan, then run `janus retrofit --plan /tmp/x.json`',
    ].join('\n');
    expect(out).toBe(expected);
  });

  it('row in "Files to be overwritten" for write_file with pre_state_hash', () => {
    const plan = makePlan({
      warnings: [],
      steps: [
        {
          id: 's',
          category: 'apply-overlay',
          title: '',
          commit_message: 'c',
          preconditions: [],
          operations: [{ op: 'write_file', path: 'biome.jsonc', content: '{}', pre_state_hash: HASH }],
          commit_paths: ['biome.jsonc'],
        },
      ],
    });
    const out = formatDiagnoseSummary(plan, '/tmp/x.json');
    expect(out).toContain('Files to be overwritten (1):');
    expect(out).toContain('biome.jsonc');
    expect(out).toContain('sha256:abcdef012345…');
    expect(out).toContain('→ janus');
  });

  it('row in "Files to be merged" for claude_settings_merge', () => {
    const plan = makePlan({
      warnings: [],
      steps: [
        {
          id: 's',
          category: 'apply-overlay',
          title: '',
          commit_message: 'c',
          preconditions: [],
          operations: [{ op: 'claude_settings_merge', additions: {} }],
          commit_paths: ['.claude/settings.json'],
        },
      ],
    });
    const out = formatDiagnoseSummary(plan, '/tmp/x.json');
    expect(out).toContain('Files to be merged (1, additive — user content preserved):');
    expect(out).toContain('.claude/settings.json');
    expect(out).toContain('→ settings merge per §8');
  });

  it('row in "Files to be merged" for gitignore_merge', () => {
    const plan = makePlan({
      warnings: [],
      steps: [
        {
          id: 's',
          category: 'apply-overlay',
          title: '',
          commit_message: 'c',
          preconditions: [],
          operations: [{ op: 'gitignore_merge', lines: ['dist\n'] }],
          commit_paths: ['.gitignore'],
        },
      ],
    });
    const out = formatDiagnoseSummary(plan, '/tmp/x.json');
    expect(out).toContain('Files to be merged (1, additive — user content preserved):');
    expect(out).toContain('.gitignore');
    expect(out).toContain('→ janus baseline block');
  });

  it('row in "Files to be merged" for write_file package.json with pre_state_hash', () => {
    const plan = makePlan({
      warnings: [],
      steps: [
        {
          id: 's',
          category: 'apply-overlay',
          title: '',
          commit_message: 'c',
          preconditions: [],
          operations: [{ op: 'write_file', path: 'package.json', content: '{}', pre_state_hash: HASH }],
          commit_paths: ['package.json'],
        },
      ],
    });
    const out = formatDiagnoseSummary(plan, '/tmp/x.json');
    expect(out).toContain('Files to be merged (1, additive — user content preserved):');
    expect(out).toContain('package.json');
    expect(out).toContain('→ jq deep-merge');
    // package.json with pre_state_hash MUST NOT also appear in "Files to be overwritten".
    expect(out).not.toContain('Files to be overwritten');
  });

  it('omits both blocks entirely when N === 0', () => {
    const plan = makePlan({
      warnings: [],
      steps: [
        {
          id: 's',
          category: 'install-deps',
          title: '',
          commit_message: 'c',
          preconditions: [],
          operations: [{ op: 'shell', command: 'pnpm install', commit_paths: ['pnpm-lock.yaml'] }],
          commit_paths: ['pnpm-lock.yaml'],
        },
      ],
    });
    const out = formatDiagnoseSummary(plan, '/tmp/x.json');
    expect(out).not.toContain('Files to be overwritten');
    expect(out).not.toContain('Files to be merged');
  });
});
