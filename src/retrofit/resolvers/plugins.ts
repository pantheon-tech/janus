import type { JanusMarker, PluginEvidence } from '../types/index.js';

export type ResolvePluginsOpts = {
  /** Resolved plugin set from a prior `.janus.json`, if present. Empty array is treated as "no prior" (re-derive). */
  priorMarker?: Pick<JanusMarker, 'plugins'>;
  pluginEvidence: PluginEvidence;
  /** --plugin name@source flags. */
  cliAdd: string[];
  /** --no-plugin name flags (just the bare name; matches against the part before @). */
  cliRemove: string[];
  nonInteractive: boolean;
  /** Optional confirmation callback for interactive runs. Receives the auto-resolved set; returns the user's accepted set. */
  confirm?: (proposed: string[]) => Promise<string[]>;
};

export async function resolvePlugins(opts: ResolvePluginsOpts): Promise<string[]> {
  // 1. Prior marker wins outright if non-empty (frictionless re-runs).
  if (opts.priorMarker?.plugins && opts.priorMarker.plugins.length > 0) {
    return [...opts.priorMarker.plugins].sort();
  }

  // 2. Auto-detect from plugin_evidence.
  const auto = new Set<string>();
  for (const [pluginId, evidence] of Object.entries(opts.pluginEvidence)) {
    if (evidence.length > 0) auto.add(pluginId);
  }

  // 3. Add CLI --plugin flags.
  for (const id of opts.cliAdd) auto.add(id);

  // 4. Remove via CLI --no-plugin flags. Match by bare name (before @).
  for (const removeName of opts.cliRemove) {
    for (const id of [...auto]) {
      if (id.split('@')[0] === removeName) auto.delete(id);
    }
  }

  const proposed = [...auto].sort();

  // 5. Confirm if interactive.
  if (!opts.nonInteractive && opts.confirm) {
    return (await opts.confirm(proposed)).sort();
  }
  return proposed;
}
