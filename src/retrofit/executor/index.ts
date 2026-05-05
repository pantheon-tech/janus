import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { JanusError } from '../errors.js';
import type { Plan } from '../types/index.js';
import { checkoutNewBranch, lastCommitSha } from './git.js';
import { buildMarker } from './marker.js';
import { runAllRetrofitPreflight } from './preflight/index.js';
import { emptyReport, type RunReport, recordResult } from './run-report.js';
import { executeStep } from './step-driver.js';

export type ExecuteOpts = {
  planPath: string;
  /** Override the plan's target_branch. */
  branch?: string;
  noRemoteCheck?: boolean;
  dryRun?: boolean;
  /** For tests: clock injection. */
  now?: Date;
  shared_overlay_version?: string;
  archetype_overlay_version?: string;
};

export async function execute(plan: Plan, repoRoot: string, opts: ExecuteOpts): Promise<RunReport> {
  const branch = opts.branch ?? plan.payload.target_branch;
  const targetPaths = new Set(plan.payload.steps.flatMap((s) => s.commit_paths));

  await runAllRetrofitPreflight({
    plan,
    planPath: opts.planPath,
    repoRoot,
    archetype: plan.payload.archetype,
    targetPaths,
    noRemoteCheck: opts.noRemoteCheck ?? false,
  });

  if (opts.dryRun) {
    return summarizeDryRun(plan, branch);
  }

  checkoutNewBranch(repoRoot, branch);

  const report = emptyReport(branch, plan.payload.steps.length, plan.payload.warnings.length);
  let lastSha = lastCommitSha(repoRoot);

  // The plan file lives inside the working tree but is not part of any step's
  // commit_paths. Exclude it from the EXTRANEOUS_FILE_MODIFICATIONS check.
  const planRel = relative(repoRoot, opts.planPath);
  const ignorePaths = new Set<string>([planRel]);

  for (const step of plan.payload.steps) {
    if (step.id === 'write-marker') continue; // deferred — needs full report

    try {
      const result = await executeStep(step, repoRoot, { ignorePaths });
      recordResult(report, step.id, result);
      if (result.status === 'committed') lastSha = result.sha;
    } catch (e) {
      throw new JanusError(
        e instanceof JanusError ? e.code : 'INTERNAL_ERROR',
        `step ${step.id} failed: ${(e as Error).message}\n  last-good-sha: ${lastSha}\n  recover: git reset --hard ${lastSha}`,
      );
    }
  }

  // Final marker step: build the real marker JSON, write it, then run a synthetic
  // step with no operations so the standard step-driver path stages + commits.
  const marker = buildMarker({
    plan,
    report,
    applied_at: opts.now ?? new Date(),
    shared_overlay_version: opts.shared_overlay_version ?? '0.1.0',
    archetype_overlay_version: opts.archetype_overlay_version ?? '0.1.0',
  });
  writeFileSync(join(repoRoot, '.janus.json'), `${JSON.stringify(marker, null, 2)}\n`);

  const finalStep = plan.payload.steps.find((s) => s.id === 'write-marker');
  if (finalStep) {
    const result = await executeStep(
      { ...finalStep, operations: [], commit_paths: ['.janus.json'] },
      repoRoot,
      { ignorePaths },
    );
    recordResult(report, 'write-marker', result);
  }

  return report;
}

function summarizeDryRun(plan: Plan, branch: string): RunReport {
  const report = emptyReport(branch, plan.payload.steps.length, plan.payload.warnings.length);
  for (const s of plan.payload.steps) {
    report.skipped.push({ id: s.id, reason: 'dry-run: no operations applied' });
  }
  return report;
}
