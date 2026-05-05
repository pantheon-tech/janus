import type { JanusMarker, Plan } from '../types/index.js';
import type { RunReport } from './run-report.js';

export function buildMarker(args: {
  plan: Plan;
  report: RunReport;
  applied_at: Date;
  shared_overlay_version: string;
  archetype_overlay_version: string;
}): JanusMarker {
  return {
    schema_version: '1',
    janus_version: args.plan.meta.janus_version,
    archetype: args.plan.payload.archetype,
    applied_at: args.applied_at.toISOString(),
    applied_steps: args.report.committed.map((c) => c.id),
    skipped_steps: [
      ...args.report.skipped.map((s) => s.id),
      ...args.report.empty.map((e) => e.id),
    ],
    slots: args.plan.payload.slots,
    plugins: args.plan.payload.plugins,
    shared_overlay_version: args.shared_overlay_version,
    archetype_overlay_version: args.archetype_overlay_version,
  };
}
