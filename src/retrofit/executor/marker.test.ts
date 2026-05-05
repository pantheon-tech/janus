import { describe, expect, it } from 'vitest';
import type { Plan } from '../types/index.js';
import { buildMarker } from './marker.js';
import { emptyReport } from './run-report.js';

describe('buildMarker', () => {
  it('reflects committed + skipped + empty steps from the run report', () => {
    const plan: Plan = {
      schema_version: '1',
      meta: { janus_version: '0.1.0', generated_at: '2026-05-05T00:00:00Z' },
      payload: {
        repo_root: '/x',
        archetype: 'generic-ts',
        target_branch: 'janus/retrofit',
        slots: { workload: 'foo' } as Plan['payload']['slots'],
        plugins: ['playwright@claude-plugins-official'],
        prior_marker: null,
        warnings: [],
        steps: [],
      },
    };
    const report = emptyReport('janus/retrofit', 3, 0);
    report.committed.push({ id: 'displace-eslint', sha: 'abc' });
    report.skipped.push({ id: 'displace-husky', reason: 'precondition' });
    report.empty.push({ id: 'displace-jest', reason: 'no diff' });
    const marker = buildMarker({
      plan,
      report,
      applied_at: new Date('2026-05-05T01:00:00Z'),
      shared_overlay_version: '0.1.0',
      archetype_overlay_version: '0.1.0',
    });
    expect(marker.applied_steps).toEqual(['displace-eslint']);
    expect(marker.skipped_steps).toEqual(['displace-husky', 'displace-jest']);
    expect(marker.plugins).toEqual(['playwright@claude-plugins-official']);
    expect(marker.applied_at).toBe('2026-05-05T01:00:00.000Z');
  });
});
