import { describe, expect, it } from 'vitest';
import type { OverlayTree } from '../../types/index.js';
import { generateApplyArchetypeOverlaySteps } from './apply-archetype-overlay.js';

const tree = (entries: string[]): OverlayTree => {
  const m: OverlayTree = new Map();
  for (const k of entries) m.set(k, { content: Buffer.from('x', 'utf8'), mode: 0o644 });
  return m;
};

describe('generateApplyArchetypeOverlaySteps', () => {
  it('emits one step per top-level group of archetype-only files', () => {
    const archetypeOnly = new Set(['host.json', 'src/index.ts', 'tests/x.test.ts']);
    const steps = generateApplyArchetypeOverlaySteps(tree([...archetypeOnly]), [], archetypeOnly);
    const ids = steps.map((s) => s.id).sort();
    expect(ids).toEqual([
      'apply-archetype-overlay/host.json',
      'apply-archetype-overlay/src',
      'apply-archetype-overlay/tests',
    ]);
  });

  it('throws if archetype overlay contains a displaced-tool config (§6.6.5)', () => {
    expect(() =>
      generateApplyArchetypeOverlaySteps(tree(['.eslintrc.json']), [], new Set(['.eslintrc.json'])),
    ).toThrow(/ARCHETYPE_DISPLACED_TOOL_CONFLICT/);
  });

  it('returns empty when archetype contributes nothing', () => {
    expect(generateApplyArchetypeOverlaySteps(tree([]), [], new Set())).toEqual([]);
  });
});
