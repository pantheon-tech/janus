import { describe, expect, it } from 'vitest';
import type { OverlayTree } from '../../types/index.js';
import { generateApplySharedOverlaySteps } from './apply-shared-overlay.js';

const tree = (entries: Array<[string, string]>): OverlayTree => {
  const m: OverlayTree = new Map();
  for (const [k, v] of entries) m.set(k, { content: Buffer.from(v, 'utf8'), mode: 0o644 });
  return m;
};

describe('generateApplySharedOverlaySteps', () => {
  it('groups files by first path segment', () => {
    const t = tree([
      ['.github/workflows/ci.yml', 'name: ci'],
      ['.github/dependabot.yml', 'version: 2'],
      ['docs/conventions/foo.md', 'x'],
      ['biome.jsonc', '{}'],
      ['AGENTS.md', '#'],
    ]);
    const steps = generateApplySharedOverlaySteps(t, [], {
      has_user_gitignore: false,
      gitignore_lines: [],
      archetype_only: new Set(),
    });
    const ids = steps.map((s) => s.id).sort();
    expect(ids).toEqual([
      'apply-shared-overlay/.github',
      'apply-shared-overlay/docs',
      'root-configs',
      'root-docs',
    ]);
  });

  it('partitions root files into dotfiles/configs/docs', () => {
    const t = tree([
      ['.editorconfig', 'x'],
      ['.gitattributes', 'x'],
      ['biome.jsonc', '{}'],
      ['package.json', '{}'],
      ['AGENTS.md', '#'],
      ['README.md', '#'],
      ['LICENSE', 'MIT'],
    ]);
    const steps = generateApplySharedOverlaySteps(t, [], {
      has_user_gitignore: false,
      gitignore_lines: [],
      archetype_only: new Set(),
    });
    const dotfiles = steps.find((s) => s.id === 'root-dotfiles');
    const configs = steps.find((s) => s.id === 'root-configs');
    const docs = steps.find((s) => s.id === 'root-docs');
    expect(dotfiles?.commit_paths).toEqual(
      expect.arrayContaining(['.editorconfig', '.gitattributes']),
    );
    expect(configs?.commit_paths).toEqual(expect.arrayContaining(['biome.jsonc', 'package.json']));
    expect(docs?.commit_paths).toEqual(
      expect.arrayContaining(['AGENTS.md', 'LICENSE', 'README.md']),
    );
  });

  it('attaches gitignore_merge to root-dotfiles when user has .gitignore', () => {
    const t = tree([['.editorconfig', 'x']]);
    const steps = generateApplySharedOverlaySteps(t, [], {
      has_user_gitignore: true,
      gitignore_lines: ['node_modules/', 'dist/'],
      archetype_only: new Set(),
    });
    const dotfiles = steps.find((s) => s.id === 'root-dotfiles');
    const merge = dotfiles?.operations.find((o) => o.op === 'gitignore_merge');
    expect(merge).toBeDefined();
    expect((merge as { lines: string[] }).lines).toEqual(['node_modules/', 'dist/']);
    expect(dotfiles?.commit_paths).toContain('.gitignore');
  });

  it('uses write_file when user has no .gitignore', () => {
    const t = tree([['.editorconfig', 'x']]);
    const steps = generateApplySharedOverlaySteps(t, [], {
      has_user_gitignore: false,
      gitignore_lines: ['node_modules/'],
      archetype_only: new Set(),
    });
    const dotfiles = steps.find((s) => s.id === 'root-dotfiles');
    const writeIgnore = dotfiles?.operations.find(
      (o) => o.op === 'write_file' && (o as { path: string }).path === '.gitignore',
    );
    expect(writeIgnore).toBeDefined();
  });

  it('skips _shared/.claude/** entries (owned by merge-claude-kit)', () => {
    const t = tree([
      ['.claude/hooks/foo.sh', '#!/bin/sh'],
      ['biome.jsonc', '{}'],
    ]);
    const steps = generateApplySharedOverlaySteps(t, [], {
      has_user_gitignore: false,
      gitignore_lines: [],
      archetype_only: new Set(),
    });
    expect(steps.find((s) => s.id === 'apply-shared-overlay/.claude')).toBeUndefined();
  });
});
