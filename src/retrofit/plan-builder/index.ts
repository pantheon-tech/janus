import type { Archetype, OverlayResult, Plan, RepoSnapshot, Sha256 } from '../types/index.js';
import { sortSteps, sortWarnings } from './determinism.js';
import { shouldEmit } from './idempotency.js';
import { generateApplyArchetypeOverlaySteps } from './steps/apply-archetype-overlay.js';
import { generateApplySharedOverlaySteps } from './steps/apply-shared-overlay.js';
import { generateDisplaceToolsSteps } from './steps/displace-tools.js';
import { generateInstallDepsStep } from './steps/install-deps.js';
import { generateMergeClaudeKitSteps, type MergeClaudeKitOpts } from './steps/merge-claude-kit.js';
import { generateSetPackageManagerStep } from './steps/set-package-manager.js';
import { generateWriteMarkerStep } from './steps/write-marker.js';
import { collectWarnings } from './warnings.js';

export type BuildPlanInput = {
  snapshot: RepoSnapshot;
  overlay: OverlayResult;
  slots: Record<string, string>;
  plugins: string[];
  archetype: Archetype;
  janusVersion: string;
  targetBranch: string;
  now: Date;
  has_user_gitignore: boolean;
};

export function buildPlan(input: BuildPlanInput): Plan {
  const { snapshot, overlay, slots, plugins, archetype, janusVersion, targetBranch, now } = input;

  const rawSteps: Plan['payload']['steps'] = [];

  rawSteps.push(...generateDisplaceToolsSteps(snapshot.displaced_tools));

  const setPm = generateSetPackageManagerStep(snapshot.lockfiles_present);
  if (setPm) rawSteps.push(setPm);

  rawSteps.push(
    ...generateApplySharedOverlaySteps(overlay.tree, snapshot.baseline_files, {
      has_user_gitignore: input.has_user_gitignore,
      gitignore_lines: overlay.gitignore_lines,
    }),
  );

  rawSteps.push(
    ...generateApplyArchetypeOverlaySteps(
      overlay.tree,
      snapshot.baseline_files,
      overlay.archetype_only,
    ),
  );

  const settingsBaseline = snapshot.baseline_files.find((b) => b.path === '.claude/settings.json');
  const claudeMdBaseline = snapshot.baseline_files.find((b) => b.path === 'CLAUDE.md');

  const workload = slots.workload;
  if (workload === undefined) {
    throw new Error('buildPlan: slots.workload is required');
  }
  const mergeOpts: MergeClaudeKitOpts = { workload, plugins };
  if (settingsBaseline?.pre_state_hash !== undefined) {
    mergeOpts.settings_pre_state_hash = settingsBaseline.pre_state_hash as Sha256;
  }
  if (claudeMdBaseline?.pre_state_hash !== undefined) {
    mergeOpts.claude_md_pre_state_hash = claudeMdBaseline.pre_state_hash as Sha256;
  }
  rawSteps.push(...generateMergeClaudeKitSteps(overlay.tree, snapshot.claude_kit, mergeOpts));

  const installDeps = generateInstallDepsStep(archetype);
  if (installDeps) rawSteps.push(installDeps);

  rawSteps.push(generateWriteMarkerStep());

  const filteredSteps = rawSteps
    .map((step) => ({
      ...step,
      operations: step.operations.filter((op) =>
        shouldEmit(op, {
          baseline_files: snapshot.baseline_files,
          ...(snapshot.package_json !== undefined ? { package_json: snapshot.package_json } : {}),
        }),
      ),
    }))
    .filter((step) => step.operations.length > 0);

  const steps = sortSteps(filteredSteps).map((s) => ({
    ...s,
    commit_paths: [...s.commit_paths].sort(),
  }));

  const { baseline_files, ...snapshotWithoutBaseline } = snapshot;
  void baseline_files;
  const warnings = sortWarnings(
    collectWarnings({
      snapshot: snapshotWithoutBaseline,
      baseline_files: snapshot.baseline_files,
      overlay,
      archetype,
      plugins,
      user_settings_json: snapshot.claude_kit.settings_json,
      ...(snapshot.package_json !== undefined ? { package_json: snapshot.package_json } : {}),
    }),
  );

  return {
    schema_version: '1',
    meta: {
      janus_version: janusVersion,
      generated_at: now.toISOString(),
    },
    payload: {
      repo_root: snapshot.repo_root,
      archetype,
      target_branch: targetBranch,
      slots: slots as Plan['payload']['slots'],
      plugins,
      prior_marker: snapshot.prior_marker ?? null,
      warnings,
      steps,
    },
  };
}
