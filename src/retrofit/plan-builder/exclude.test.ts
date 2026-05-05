import { describe, expect, it } from 'vitest';
import { buildIsExcluded } from './exclude.js';

describe('buildIsExcluded', () => {
  it('matches exact path', () => {
    const isExcluded = buildIsExcluded(['.github/workflows/deploy.yml.tmpl', 'src/']);
    expect(isExcluded('.github/workflows/deploy.yml.tmpl')).toBe(true);
    expect(isExcluded('.github/workflows/ci.yml.tmpl')).toBe(false);
  });

  it('matches directory pattern (trailing slash) and contents', () => {
    const isExcluded = buildIsExcluded(['infra/']);
    expect(isExcluded('infra')).toBe(true);
    expect(isExcluded('infra/main.bicep')).toBe(true);
    expect(isExcluded('infra/modules/foo.bicep')).toBe(true);
    expect(isExcluded('infrastructure/x.txt')).toBe(false);
  });

  it('skips comments and blank lines', () => {
    const isExcluded = buildIsExcluded(['# a comment', '', 'src/', '   ', '# another']);
    expect(isExcluded('src/foo.ts')).toBe(true);
    expect(isExcluded('# a comment')).toBe(false);
  });

  it('returns false for empty pattern list', () => {
    const isExcluded = buildIsExcluded([]);
    expect(isExcluded('anything')).toBe(false);
  });
});
