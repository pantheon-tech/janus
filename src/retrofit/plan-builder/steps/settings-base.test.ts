import { describe, expect, it } from 'vitest';
import { buildSettingsBase } from './settings-base.js';

describe('buildSettingsBase', () => {
  it('emits OTEL_RESOURCE_ATTRIBUTES with workload', () => {
    const s = buildSettingsBase({ workload: 'foo', plugins: [] });
    expect(s.env?.OTEL_RESOURCE_ATTRIBUTES).toBe('project=foo');
  });

  it('includes the standard permissions allow/deny sets', () => {
    const s = buildSettingsBase({ workload: 'foo', plugins: [] });
    expect(s.permissions?.allow).toEqual(expect.arrayContaining(['Bash(pnpm *)', 'Read(**)']));
    expect(s.permissions?.deny).toEqual(expect.arrayContaining(['Bash(rm -rf *)', 'Read(.env)']));
  });

  it('includes the four hook entries', () => {
    const s = buildSettingsBase({ workload: 'foo', plugins: [] });
    expect(Object.keys(s.hooks ?? {})).toEqual(
      expect.arrayContaining(['SessionStart', 'SessionEnd', 'WorktreeCreate', 'WorktreeRemove']),
    );
  });

  it('plugs plugins into enabledPlugins', () => {
    const s = buildSettingsBase({
      workload: 'foo',
      plugins: ['frontend-design@claude-plugins-official', 'playwright@claude-plugins-official'],
    });
    expect(s.enabledPlugins).toEqual({
      'frontend-design@claude-plugins-official': true,
      'playwright@claude-plugins-official': true,
    });
  });
});
