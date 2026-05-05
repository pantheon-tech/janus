import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../analyzer/index.js';
import { baselineDiff } from '../analyzer/baseline-diff.js';
import { resolvePlugins } from '../resolvers/plugins.js';
import { resolveSlots, type SlotKey } from '../resolvers/slots.js';
import type { Archetype, Plan } from '../types/index.js';
import { buildPlan } from './index.js';
import { buildOverlayTree } from './overlay-tree.js';

const DEFAULT_JANUS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export type DiagnoseOpts = {
  repoRoot: string;
  archetype: string;
  janusRoot?: string;
  janusVersion?: string;
  targetBranch?: string;
  now?: Date;
  cliSlots?: Partial<Record<SlotKey, string>>;
  cliPluginAdd?: string[];
  cliPluginRemove?: string[];
  nonInteractive?: boolean;
  prompt?: (key: SlotKey) => Promise<string>;
  confirmPlugins?: (proposed: string[]) => Promise<string[]>;
  /** If supplied, write the plan JSON here. Otherwise return without writing. */
  outPath?: string;
  /**
   * Forwarded to `analyze(repoRoot, { unrecognizedToolsAllowlist })`. Plan 5's
   * CLI loads this via `loadUnrecognizedToolsAllowlist(janusRoot)` (Plan 2)
   * before calling `diagnose`; when omitted, the analyzer falls back to its
   * hardcoded starter list.
   */
  unrecognizedToolsAllowlist?: string[];
};

export async function diagnose(opts: DiagnoseOpts): Promise<Plan> {
  const janusRoot = opts.janusRoot ?? DEFAULT_JANUS_ROOT;
  const janusVersion = opts.janusVersion ?? '0.1.0';
  const targetBranch = opts.targetBranch ?? 'janus/retrofit';
  const now = opts.now ?? new Date();

  const snapshot = analyze(opts.repoRoot, {
    ...(opts.unrecognizedToolsAllowlist
      ? { unrecognizedToolsAllowlist: opts.unrecognizedToolsAllowlist }
      : {}),
  });

  const slots = await resolveSlots({
    snapshot,
    archetype: opts.archetype,
    cliSlots: opts.cliSlots ?? {},
    nonInteractive: opts.nonInteractive ?? true,
    janusVersion,
    now,
    ...(opts.prompt ? { prompt: opts.prompt } : {}),
  });

  const plugins = await resolvePlugins({
    ...(snapshot.prior_marker !== undefined ? { priorMarker: snapshot.prior_marker } : {}),
    pluginEvidence: snapshot.plugin_evidence,
    cliAdd: opts.cliPluginAdd ?? [],
    cliRemove: opts.cliPluginRemove ?? [],
    nonInteractive: opts.nonInteractive ?? true,
    ...(opts.confirmPlugins ? { confirm: opts.confirmPlugins } : {}),
  });

  const overlay = buildOverlayTree(janusRoot, opts.archetype, slots);
  const baseline = baselineDiff(opts.repoRoot, overlay.tree);
  const fullSnapshot = { ...snapshot, baseline_files: baseline };
  const has_user_gitignore = existsSync(join(opts.repoRoot, '.gitignore'));

  const plan = buildPlan({
    snapshot: fullSnapshot,
    overlay,
    slots,
    plugins,
    archetype: opts.archetype as Archetype,
    janusVersion,
    targetBranch,
    now,
    has_user_gitignore,
  });

  if (opts.outPath) {
    writeFileSync(opts.outPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  }
  return plan;
}
