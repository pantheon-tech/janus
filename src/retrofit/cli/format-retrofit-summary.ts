import type { RunReport } from '../executor/run-report.js';

export function formatRetrofitSummary(report: RunReport): string {
  const n = report.committed.length;
  const w = report.warnings_count;
  const lines: string[] = [];
  lines.push(
    `✓ Retrofit complete on branch ${report.branch} (${n} commit${n === 1 ? '' : 's'}, ${w} warning${w === 1 ? '' : 's'})`,
  );
  if (report.skipped.length > 0) {
    lines.push(`Skipped: ${report.skipped.map((s) => s.id).join(', ')}`);
  }
  if (report.empty.length > 0) {
    lines.push(`Empty (no diff): ${report.empty.map((s) => s.id).join(', ')}`);
  }
  lines.push('');
  lines.push('Next steps:');
  lines.push(`  git push -u origin ${report.branch}`);
  lines.push(
    '  gh pr create --base staging   # janus convention: feature PRs target staging, not main',
  );
  return lines.join('\n');
}
