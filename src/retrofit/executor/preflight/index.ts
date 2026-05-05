import type { Plan } from '../../types/index.js';
import { runDiagnoseChecks } from './diagnose-checks.js';
import { runPostOverlayChecks } from './post-overlay-checks.js';
import { runRetrofitChecks } from './retrofit-checks.js';

export async function runAllRetrofitPreflight(opts: {
  plan: Plan;
  planPath: string;
  repoRoot: string;
  archetype: string;
  targetPaths: Set<string>;
  noRemoteCheck?: boolean;
}): Promise<void> {
  // #1-#5, #8
  await runDiagnoseChecks(opts.repoRoot, opts.archetype);
  // #6, #7 (deferred until overlay computed; caller passes targetPaths)
  runPostOverlayChecks(opts.repoRoot, opts.targetPaths);
  // #9-#16
  await runRetrofitChecks(opts);
}

export { runDiagnoseChecks, runPostOverlayChecks, runRetrofitChecks };
