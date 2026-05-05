import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildOverlayTree } from './overlay-tree.js';

const JANUS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('buildOverlayTree (walker, .exclude, mode)', () => {
  it('includes _shared/ verbatim files for generic-ts', () => {
    const tree = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots(), { skipTmpl: true });
    expect(tree.has('biome.jsonc')).toBe(true);
    const entry = tree.get('biome.jsonc')!;
    expect(entry.content.length).toBeGreaterThan(0);
    expect(entry.mode).toBe(0o644);
  });

  it('respects archetype .exclude — generic-ts excludes infra/', () => {
    const tree = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots(), { skipTmpl: true });
    for (const path of tree.keys()) {
      expect(path.startsWith('infra/')).toBe(false);
    }
  });

  it('respects archetype .exclude — backend-functions excludes src/ and tests/', () => {
    if (!existsSync(join(JANUS_ROOT, 'templates/backend-functions/.exclude'))) {
      return;
    }
    const tree = buildOverlayTree(JANUS_ROOT, 'backend-functions', stubSlots(), {
      skipTmpl: true,
    });
    for (const path of tree.keys()) {
      expect(path.startsWith('src/')).toBe(false);
      expect(path.startsWith('tests/')).toBe(false);
    }
  });

  it('captures hook scripts with mode 0755', () => {
    const tree = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots(), { skipTmpl: true });
    for (const [path, entry] of tree.entries()) {
      if (path.startsWith('.claude/hooks/') && path.endsWith('.sh')) {
        expect(entry.mode).toBe(0o755);
      }
    }
  });
});

function stubSlots(): Record<string, string> {
  return {
    workload: 'foo',
    description: 'd',
    archetype: 'generic-ts',
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
  };
}
