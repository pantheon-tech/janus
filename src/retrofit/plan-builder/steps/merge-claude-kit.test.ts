import { describe, expect, it } from 'vitest';
import type { ClaudeKitSnapshot, OverlayTree, Sha256 } from '../../types/index.js';
import { generateMergeClaudeKitSteps } from './merge-claude-kit.js';

const tree = (entries: Array<[string, string, number?]>): OverlayTree => {
  const m: OverlayTree = new Map();
  for (const [k, v, mode] of entries)
    m.set(k, { content: Buffer.from(v, 'utf8'), mode: mode ?? 0o644 });
  return m;
};

const emptyKit: ClaudeKitSnapshot = {
  has_claude_dir: false,
  has_settings_json: false,
  has_claude_md: false,
  has_pre_janus_md: false,
  hooks: [],
  skills: [],
  misc: [],
};

describe('generateMergeClaudeKitSteps', () => {
  it('emits all 5 substep ids when janus ships content for each', () => {
    const t = tree([
      ['.claude/hooks/foo.sh', '#!/bin/sh', 0o755],
      ['.claude/skills/bar.md', '#'],
      ['.claude/README.md', '#'],
      ['CLAUDE.md', '@AGENTS.md\n'],
    ]);
    const steps = generateMergeClaudeKitSteps(t, emptyKit, {
      workload: 'foo',
      plugins: [],
    });
    const ids = steps.map((s) => s.id).sort();
    expect(ids).toContain('claude-settings-merge');
    expect(ids).toContain('claude-md-snapshot');
    expect(ids).toContain('claude-skills-overlay');
    expect(ids).toContain('claude-hooks-overlay');
    expect(ids).toContain('claude-misc-overlay');
  });

  it('claude-settings-merge carries settings additions payload + pre_state_hash if user has one', () => {
    const userKit: ClaudeKitSnapshot = {
      ...emptyKit,
      has_claude_dir: true,
      has_settings_json: true,
    };
    const steps = generateMergeClaudeKitSteps(tree([['CLAUDE.md', '@AGENTS.md\n']]), userKit, {
      workload: 'foo',
      plugins: ['frontend-design@claude-plugins-official'],
      settings_pre_state_hash: 'sha256:00' as Sha256,
    });
    const settings = steps.find((s) => s.id === 'claude-settings-merge');
    expect(settings).toBeDefined();
    const op = settings?.operations[0];
    expect(op?.op).toBe('claude_settings_merge');
    expect(
      (op as { additions: { enabledPlugins?: Record<string, boolean> } }).additions.enabledPlugins,
    ).toEqual({
      'frontend-design@claude-plugins-official': true,
    });
    expect((op as { pre_state_hash?: string }).pre_state_hash).toBe('sha256:00');
  });

  it('claude-md-snapshot only emits rename when CLAUDE.md exists', () => {
    const userKit: ClaudeKitSnapshot = { ...emptyKit, has_claude_md: true };
    const steps = generateMergeClaudeKitSteps(tree([['CLAUDE.md', '@AGENTS.md\n']]), userKit, {
      workload: 'foo',
      plugins: [],
    });
    const snap = steps.find((s) => s.id === 'claude-md-snapshot');
    expect(snap?.operations.find((o) => o.op === 'rename_file')).toBeDefined();
  });
});
