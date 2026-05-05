import type { StepResult } from './step-driver.js';

export type RunReport = {
  branch: string;
  total_steps: number;
  committed: Array<{ id: string; sha: string }>;
  skipped: Array<{ id: string; reason: string }>;
  empty: Array<{ id: string; reason: string }>;
  warnings_count: number;
  last_good_sha?: string;
};

export function emptyReport(branch: string, totalSteps: number, warningsCount: number): RunReport {
  return {
    branch,
    total_steps: totalSteps,
    committed: [],
    skipped: [],
    empty: [],
    warnings_count: warningsCount,
  };
}

export function recordResult(report: RunReport, stepId: string, result: StepResult): void {
  if (result.status === 'committed') {
    report.committed.push({ id: stepId, sha: result.sha });
    report.last_good_sha = result.sha;
  } else if (result.status === 'skipped') {
    report.skipped.push({ id: stepId, reason: result.reason });
  } else if (result.status === 'committed_empty') {
    report.empty.push({ id: stepId, reason: result.reason });
  }
}
