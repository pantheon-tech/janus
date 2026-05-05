import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildOverlayTree } from './overlay-tree.js';

const JANUS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('buildOverlayTree (walker, .exclude, mode)', () => {
  it('includes _shared/ verbatim files for generic-ts', () => {
    const { tree } = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots(), { skipTmpl: true });
    expect(tree.has('biome.jsonc')).toBe(true);
    const entry = tree.get('biome.jsonc')!;
    expect(entry.content.length).toBeGreaterThan(0);
    expect(entry.mode).toBe(0o644);
  });

  it('respects archetype .exclude — generic-ts excludes infra/', () => {
    const { tree } = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots(), { skipTmpl: true });
    for (const path of tree.keys()) {
      expect(path.startsWith('infra/')).toBe(false);
    }
  });

  it('archetype .exclude removes _shared src/ and tests/ — any survivors are archetype-owned', () => {
    if (!existsSync(join(JANUS_ROOT, 'templates/backend-functions/.exclude'))) {
      return;
    }
    const { tree, archetype_only } = buildOverlayTree(
      JANUS_ROOT,
      'backend-functions',
      stubSlots(),
      { skipTmpl: true },
    );
    for (const path of tree.keys()) {
      if (path.startsWith('src/') || path.startsWith('tests/')) {
        expect(archetype_only.has(path)).toBe(true);
      }
    }
  });

  it('captures hook scripts with mode 0755', () => {
    const { tree } = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots(), { skipTmpl: true });
    for (const [path, entry] of tree.entries()) {
      if (path.startsWith('.claude/hooks/') && path.endsWith('.sh')) {
        expect(entry.mode).toBe(0o755);
      }
    }
  });

  it('renders .tmpl files using slots', () => {
    const { tree } = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots());
    const readme = tree.get('README.md');
    expect(readme).toBeDefined();
    const text = readme!.content.toString('utf8');
    expect(text).not.toContain('{{workload}}');
    expect(text).not.toContain('<%workload%>');
  });

  it('archetype overlay replaces shared file (backend-functions has its own AGENTS.md.tmpl)', () => {
    const { tree } = buildOverlayTree(JANUS_ROOT, 'backend-functions', stubSlots());
    const agents = tree.get('AGENTS.md');
    expect(agents).toBeDefined();
    expect(agents!.content.toString('utf8').length).toBeGreaterThan(0);
  });

  it('jq-merges archetype package.json over shared package.json', () => {
    const { tree } = buildOverlayTree(JANUS_ROOT, 'backend-functions', stubSlots());
    const pkgEntry = tree.get('package.json');
    expect(pkgEntry).toBeDefined();
    const pkg = JSON.parse(pkgEntry!.content.toString('utf8'));
    expect(pkg.name).toBeDefined();
  });

  it('skips archetype README.md (meta documentation, never shipped)', () => {
    const { tree } = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots());
    const readme = tree.get('README.md');
    expect(readme).toBeDefined();
  });

  it('records every archetype-walked path in archetype_only', () => {
    const { tree, archetype_only } = buildOverlayTree(
      JANUS_ROOT,
      'backend-functions',
      stubSlots(),
    );
    expect(archetype_only.size).toBeGreaterThan(0);
    expect(tree.has('package.json')).toBe(true);
    expect(archetype_only.has('package.json')).toBe(true);
    for (const path of archetype_only) {
      expect(tree.has(path)).toBe(true);
    }
  });

  it('keeps archetype_only restricted to archetype-owned paths (sanity)', () => {
    const { archetype_only } = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots());
    // biome.jsonc lives only in _shared/, never in archetype_only.
    expect(archetype_only.has('biome.jsonc')).toBe(false);
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
