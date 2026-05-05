import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import type { OverlayTree } from '../types/index.js';
import { baselineDiff } from './baseline-diff.js';

const overlay = (entries: Array<[string, string, number?]>): OverlayTree => {
  const map: OverlayTree = new Map();
  for (const [path, content, mode] of entries) {
    map.set(path, { content: Buffer.from(content, 'utf8'), mode: mode ?? 0o644 });
  }
  return map;
};

describe('baselineDiff', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('reports missing for files not in the repo', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const tree = overlay([['biome.jsonc', '{}']]);
    const diff = baselineDiff(fx.dir, tree);
    expect(diff).toHaveLength(1);
    expect(diff[0]?.path).toBe('biome.jsonc');
    expect(diff[0]?.status).toBe('missing');
    expect(diff[0]?.pre_state_hash).toBeUndefined();
    expect(diff[0]?.current_mode).toBeUndefined();
  });

  it('reports present_identical when content matches byte-for-byte', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'biome.jsonc'), '{}');
    const tree = overlay([['biome.jsonc', '{}']]);
    const diff = baselineDiff(fx.dir, tree);
    expect(diff[0]?.status).toBe('present_identical');
    expect(diff[0]?.pre_state_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(diff[0]?.current_mode).toBe(0o644);
  });

  it('reports present_differs when content does not match', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'biome.jsonc'), '{ "foo": 1 }');
    const tree = overlay([['biome.jsonc', '{}']]);
    const diff = baselineDiff(fx.dir, tree);
    expect(diff[0]?.status).toBe('present_differs');
    expect(diff[0]?.pre_state_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('reports current_mode when present', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.claude/hooks'), { recursive: true });
    writeFileSync(join(fx.dir, '.claude/hooks/foo.sh'), '#!/bin/sh\necho hi\n', { mode: 0o755 });
    const tree = overlay([['.claude/hooks/foo.sh', '#!/bin/sh\necho hi\n', 0o755]]);
    const diff = baselineDiff(fx.dir, tree);
    expect(diff[0]?.current_mode).toBe(0o755);
  });

  it('returns sorted output (deterministic)', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const tree = overlay([
      ['z.txt', 'z'],
      ['a.txt', 'a'],
      ['m.txt', 'm'],
    ]);
    const diff = baselineDiff(fx.dir, tree);
    expect(diff.map((d) => d.path)).toEqual(['a.txt', 'm.txt', 'z.txt']);
  });
});
