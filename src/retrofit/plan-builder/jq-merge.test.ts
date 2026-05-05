import { describe, expect, it } from 'vitest';
import { jqDeepMerge } from './jq-merge.js';

describe('jqDeepMerge (jq -s ".[0] * .[1]")', () => {
  it('merges scalars right-wins', () => {
    const out = jqDeepMerge({ name: 'a', version: '1' }, { name: 'b' });
    expect(out).toEqual({ name: 'b', version: '1' });
  });

  it('merges nested objects recursively', () => {
    const out = jqDeepMerge(
      { scripts: { lint: 'eslint .', dev: 'vite' } },
      { scripts: { lint: 'biome check', test: 'vitest' } },
    );
    expect(out).toEqual({
      scripts: { lint: 'biome check', dev: 'vite', test: 'vitest' },
    });
  });

  it('right-replaces arrays at leaves (jq * semantics)', () => {
    const out = jqDeepMerge({ keywords: ['a', 'b'] }, { keywords: ['c'] });
    expect(out).toEqual({ keywords: ['c'] });
  });
});
