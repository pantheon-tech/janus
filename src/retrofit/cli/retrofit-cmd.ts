import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execute } from '../executor/index.js';
import { JanusError, MID_EXECUTION_CODES } from '../errors.js';
import { suggestAvailableBranch } from '../executor/git.js';
import { validatePlan } from '../schema/validate.js';
import { parseArgs } from './argparse.js';
import { formatRetrofitSummary } from './format-retrofit-summary.js';

export async function runRetrofit(argv: string[]): Promise<number> {
  if (process.platform === 'win32') {
    console.error('janus retrofit is not supported on Windows in v0.1.');
    return 1;
  }
  let args;
  try {
    args = parseArgs(argv, {
      string: ['plan', 'branch'],
      boolean: ['help', 'dry-run', 'no-remote-check'],
      collect: [],
    });
  } catch (e) {
    console.error(`janus retrofit: ${(e as Error).message}`);
    return 1;
  }
  if (args.help) {
    printRetrofitHelp();
    return 0;
  }
  const planPath = (args.plan as string | undefined) ?? '';
  if (!planPath) {
    console.error('janus retrofit: --plan is required');
    printRetrofitHelp();
    return 1;
  }
  if (!existsSync(planPath)) {
    console.error(`janus retrofit: plan file not found: ${planPath}`);
    return 1;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(planPath, 'utf8'));
  } catch (e) {
    console.error(`janus retrofit: plan is not valid JSON: ${(e as Error).message}`);
    return 1;
  }
  const validation = validatePlan(parsed);
  if (!validation.ok) {
    console.error(`janus retrofit: plan failed schema validation:\n  ${validation.errors.join('\n  ')}`);
    return 1;
  }
  const plan = validation.value;
  const repoRoot = process.cwd();
  const noRemoteCheck = Boolean(args['no-remote-check']);
  const dryRun = Boolean(args['dry-run']);

  // Branch handling: if user supplied --branch, use it. Else use plan's default and rely on
  // pre-flight #14 to detect collisions; on TARGET_BRANCH_EXISTS, suggest the next free name.
  const branchOverride = args.branch as string | undefined;

  try {
    const report = await execute(plan, repoRoot, {
      planPath: resolve(planPath),
      ...(branchOverride ? { branch: branchOverride } : {}),
      noRemoteCheck,
      dryRun,
    });
    if (dryRun) {
      console.log(`✓ Dry run passed. ${plan.payload.steps.length} steps would run on branch ${report.branch}.`);
      console.log('');
      for (let i = 0; i < plan.payload.steps.length; i++) {
        const step = plan.payload.steps[i]!;
        console.log(`Step ${i + 1}: ${step.id}`);
        console.log(`  title: ${step.title}`);
        console.log(`  ops: ${step.operations.length}`);
        console.log(`  commit_paths: [${step.commit_paths.join(', ')}]`);
      }
      return 0;
    }
    console.log(formatRetrofitSummary(report));
    return 0;
  } catch (e) {
    if (e instanceof JanusError && e.code === 'TARGET_BRANCH_EXISTS' && !branchOverride) {
      // Auto-suggest a free branch (soft-fail per §11). Soft-fail is exit 1
      // — same as other pre-flight failures — but with a constructive
      // suggestion the user can paste back as `--branch <name>`.
      try {
        const suggestion = suggestAvailableBranch(repoRoot, plan.payload.target_branch, noRemoteCheck);
        console.error(
          `janus retrofit: target branch ${plan.payload.target_branch} exists; re-run with --branch ${suggestion}`,
        );
      } catch {
        console.error(`janus retrofit: target branch ${plan.payload.target_branch} exists and no free name in -2..-99`);
      }
      return 1;
    }
    if (e instanceof JanusError) {
      if (MID_EXECUTION_CODES.has(e.code)) {
        // Plan 4's executor formats the message to include the last-good SHA
        // and the `git reset --hard <sha>` hint. Print verbatim.
        console.error(`janus retrofit: ${e.message}`);
        return 2;
      }
      console.error(`janus retrofit: ${e.code}: ${e.message}`);
      if (e.remediation) console.error(`  → ${e.remediation}`);
      return 1;
    }
    console.error(`janus retrofit: internal error: ${(e as Error).message}`);
    return 3;
  }
}

function printRetrofitHelp(): void {
  console.log(`Usage: janus retrofit --plan <path> [options]

Options:
  --plan <path>                 (required) plan JSON written by \`janus diagnose\`
  --branch <name>               override target branch (default from plan)
  --dry-run                     run pre-flight + print per-step summary; no mutations
  --no-remote-check             skip \`git ls-remote\` for branch existence (offline)
  --help                        show this message
`);
}
