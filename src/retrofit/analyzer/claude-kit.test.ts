import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyzeClaudeKit } from './claude-kit.js';

describe('analyzeClaudeKit', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('reports has_claude_dir: false for greenfield', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const k = analyzeClaudeKit(fx.dir);
    expect(k.has_claude_dir).toBe(false);
    expect(k.has_settings_json).toBe(false);
    expect(k.has_claude_md).toBe(false);
    expect(k.hooks).toEqual([]);
    expect(k.skills).toEqual([]);
    expect(k.misc).toEqual([]);
  });

  it('finds settings.json + skills in user-modified-skill fixture', () => {
    const fx = materializeFixture('repo-with-user-modified-skill');
    cleanups.push(fx.cleanup);
    const k = analyzeClaudeKit(fx.dir);
    expect(k.has_claude_dir).toBe(true);
    expect(k.has_settings_json).toBe(true);
    expect(k.skills).toContain('foo.md');
    expect(k.hooks).toEqual([]);
  });

  it('parses settings.json into settings_json', () => {
    const fx = materializeFixture('repo-with-user-modified-skill');
    cleanups.push(fx.cleanup);
    const k = analyzeClaudeKit(fx.dir);
    expect(k.settings_json).toEqual({ permissions: { allow: ['Bash(echo *)'] } });
  });
});
