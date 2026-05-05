import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { applyClaudeSettingsMerge } from './claude-settings.js';

describe('applyClaudeSettingsMerge', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('writes settings.json from scratch when none exists', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await applyClaudeSettingsMerge(
      {
        op: 'claude_settings_merge',
        additions: {
          permissions: { allow: ['Bash(pnpm *)'], deny: ['Bash(rm -rf *)'] },
          hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: '.claude/hooks/x.sh' }] }],
          },
          enabledPlugins: { 'frontend-design@claude-plugins-official': true },
        },
      },
      { repoRoot: fx.dir },
    );
    const written = JSON.parse(readFileSync(join(fx.dir, '.claude/settings.json'), 'utf8'));
    expect(written.permissions.allow).toEqual(['Bash(pnpm *)']);
    expect(written.enabledPlugins['frontend-design@claude-plugins-official']).toBe(true);
  });

  it('appends only non-duplicate permissions entries', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.claude'));
    writeFileSync(
      join(fx.dir, '.claude/settings.json'),
      JSON.stringify({ permissions: { allow: ['Read(**)'] } }),
    );
    await applyClaudeSettingsMerge(
      {
        op: 'claude_settings_merge',
        additions: {
          permissions: { allow: ['Read(**)', 'Bash(pnpm *)'], deny: [] },
        },
      },
      { repoRoot: fx.dir },
    );
    const merged = JSON.parse(readFileSync(join(fx.dir, '.claude/settings.json'), 'utf8'));
    expect(merged.permissions.allow).toEqual(['Read(**)', 'Bash(pnpm *)']);
  });

  it('preserves user scalar (e.g., cleanupPeriodDays) when set', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.claude'));
    writeFileSync(join(fx.dir, '.claude/settings.json'), JSON.stringify({ cleanupPeriodDays: 30 }));
    await applyClaudeSettingsMerge(
      {
        op: 'claude_settings_merge',
        additions: { cleanupPeriodDays: 7 },
      },
      { repoRoot: fx.dir },
    );
    const merged = JSON.parse(readFileSync(join(fx.dir, '.claude/settings.json'), 'utf8'));
    expect(merged.cleanupPeriodDays).toBe(30);
  });
});
