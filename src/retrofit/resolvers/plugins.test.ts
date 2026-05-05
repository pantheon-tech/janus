import { describe, expect, it } from 'vitest';
import type { JanusMarker, PluginEvidence } from '../types/index.js';
import { resolvePlugins } from './plugins.js';

const noEvidence: PluginEvidence = {
  'frontend-design@claude-plugins-official': [],
  'playwright@claude-plugins-official': [],
  'pyright-lsp@claude-plugins-official': [],
};

describe('resolvePlugins', () => {
  it('returns empty when no evidence and no overrides', async () => {
    const r = await resolvePlugins({
      pluginEvidence: noEvidence,
      cliAdd: [],
      cliRemove: [],
      nonInteractive: true,
    });
    expect(r).toEqual([]);
  });

  it('auto-detects plugins with evidence', async () => {
    const r = await resolvePlugins({
      pluginEvidence: {
        'frontend-design@claude-plugins-official': ['vite.config.ts'],
        'playwright@claude-plugins-official': ['playwright.config.ts'],
        'pyright-lsp@claude-plugins-official': [],
      },
      cliAdd: [],
      cliRemove: [],
      nonInteractive: true,
    });
    expect(r).toEqual([
      'frontend-design@claude-plugins-official',
      'playwright@claude-plugins-official',
    ]);
  });

  it('--plugin adds non-auto-detectable plugins (banana-claude)', async () => {
    const r = await resolvePlugins({
      pluginEvidence: noEvidence,
      cliAdd: ['banana-claude@banana-claude-marketplace'],
      cliRemove: [],
      nonInteractive: true,
    });
    expect(r).toEqual(['banana-claude@banana-claude-marketplace']);
  });

  it('--no-plugin removes auto-detected plugins', async () => {
    const r = await resolvePlugins({
      pluginEvidence: {
        ...noEvidence,
        'pyright-lsp@claude-plugins-official': ['pyproject.toml'],
      },
      cliAdd: [],
      cliRemove: ['pyright-lsp'],
      nonInteractive: true,
    });
    expect(r).toEqual([]);
  });

  it('prior marker plugins take precedence over auto-detect', async () => {
    const prior = {
      plugins: ['frontend-design@claude-plugins-official'],
    } as Pick<JanusMarker, 'plugins'>;
    const r = await resolvePlugins({
      priorMarker: prior,
      pluginEvidence: {
        ...noEvidence,
        'playwright@claude-plugins-official': ['playwright.config.ts'],
      },
      cliAdd: [],
      cliRemove: [],
      nonInteractive: true,
    });
    expect(r).toEqual(['frontend-design@claude-plugins-official']);
  });

  it('returned list is alphabetically sorted (deterministic)', async () => {
    const r = await resolvePlugins({
      pluginEvidence: noEvidence,
      cliAdd: [
        'playwright@claude-plugins-official',
        'frontend-design@claude-plugins-official',
        'banana-claude@banana-claude-marketplace',
      ],
      cliRemove: [],
      nonInteractive: true,
    });
    expect(r).toEqual([
      'banana-claude@banana-claude-marketplace',
      'frontend-design@claude-plugins-official',
      'playwright@claude-plugins-official',
    ]);
  });

  it('--no-plugin can also strip --plugin additions', async () => {
    const r = await resolvePlugins({
      pluginEvidence: noEvidence,
      cliAdd: ['banana-claude@banana-claude-marketplace'],
      cliRemove: ['banana-claude'],
      nonInteractive: true,
    });
    expect(r).toEqual([]);
  });
});
