import { describe, expect, it } from 'vitest';
import type { RunReport } from '../executor/run-report.js';
import { formatRetrofitSummary } from './format-retrofit-summary.js';

const sample: RunReport = {
  branch: 'janus/retrofit',
  total_steps: 5,
  committed: [
    { id: 'displace-eslint', sha: 'a' },
    { id: 'apply-shared-overlay/.github', sha: 'b' },
  ],
  skipped: [],
  empty: [],
  warnings_count: 2,
  last_good_sha: 'b',
};

describe('formatRetrofitSummary', () => {
  it('reports commit count, warnings, branch, and push hint', () => {
    const out = formatRetrofitSummary(sample);
    expect(out).toContain('Retrofit complete on branch janus/retrofit');
    expect(out).toContain('2 commits');
    expect(out).toContain('2 warnings');
    expect(out).toContain('git push -u origin janus/retrofit');
    expect(out).toContain('gh pr create --base staging');
  });

  it('singularizes 1 commit', () => {
    const r: RunReport = { ...sample, committed: sample.committed.slice(0, 1) };
    expect(formatRetrofitSummary(r)).toContain('1 commit,');
  });
});
