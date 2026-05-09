import type { Plan } from '../types/index.js';

interface OverlayRow {
  path: string;
  hash: string; // already short-formatted, e.g. "sha256:abcdef012345…"
  suffix: string; // e.g. "janus" or "jq deep-merge"
}

const PATH_PAD = 28; // pad path column so hashes line up

function shortHash(preStateHash: string | undefined): string {
  if (!preStateHash) return '';
  // Input shape per Plan 1: "sha256:<64hex>". Trim to first 12 hex chars + ellipsis.
  const m = preStateHash.match(/^sha256:([0-9a-f]+)$/i);
  if (!m) return preStateHash;
  return `sha256:${m[1]!.slice(0, 12)}…`;
}

function row({ path, hash, suffix }: OverlayRow): string {
  return `  ${path.padEnd(PATH_PAD)} ${hash} → ${suffix}`;
}

function collectOverlayBlocks(plan: Plan): { overwritten: OverlayRow[]; merged: OverlayRow[] } {
  const overwritten: OverlayRow[] = [];
  const merged: OverlayRow[] = [];
  for (const step of plan.payload.steps) {
    for (const op of step.operations) {
      if (op.op === 'write_file') {
        const wf = op as { op: 'write_file'; path: string; pre_state_hash?: string };
        if (!wf.pre_state_hash) continue; // create of missing file; not an overwrite
        const hash = shortHash(wf.pre_state_hash);
        if (wf.path === 'package.json') {
          merged.push({ path: wf.path, hash, suffix: 'jq deep-merge' });
        } else {
          overwritten.push({ path: wf.path, hash, suffix: 'janus' });
        }
      } else if (op.op === 'claude_settings_merge') {
        merged.push({
          path: '.claude/settings.json',
          hash: shortHash((op as { pre_state_hash?: string }).pre_state_hash),
          suffix: 'settings merge per §8',
        });
      } else if (op.op === 'gitignore_merge') {
        merged.push({
          path: '.gitignore',
          hash: shortHash((op as { pre_state_hash?: string }).pre_state_hash),
          suffix: 'janus baseline block',
        });
      }
    }
  }
  return { overwritten, merged };
}

export function formatDiagnoseSummary(plan: Plan, outPath: string): string {
  const { meta, payload } = plan;
  const stepsByCat = new Map<string, number>();
  for (const s of payload.steps) stepsByCat.set(s.category, (stepsByCat.get(s.category) ?? 0) + 1);
  const catSummary = [...stepsByCat.entries()].map(([c, n]) => `${n} ${c}`).join(', ');

  const slots = payload.slots as Record<string, string>;
  const lines: string[] = [];
  lines.push(`janus diagnose v${meta.janus_version} — ${payload.archetype} archetype`);
  lines.push('');
  lines.push(`Plan: ${payload.steps.length} steps (${catSummary})`);
  lines.push(
    `Slots: workload=${slots.workload}, archetype=${slots.archetype}, github_org=${slots.github_org}, author=${slots.author} <${slots.author_email}>, node=${slots.node_version}, region=${slots.region}`,
  );
  lines.push(
    `Plugins: ${payload.plugins.length === 0 ? '(none)' : payload.plugins.map((p) => p.split('@')[0]).join(', ')}`,
  );
  lines.push('');

  if (payload.warnings.length > 0) {
    lines.push(`Warnings: ${payload.warnings.length}`);
    for (const w of payload.warnings) {
      const ev = w.evidence.length > 0 ? ` (${w.evidence[0]})` : '';
      lines.push(`  - ${w.code}: ${w.message}${ev}`);
    }
    lines.push('');
  }

  const { overwritten, merged } = collectOverlayBlocks(plan);
  if (overwritten.length > 0) {
    lines.push(`Files to be overwritten (${overwritten.length}):`);
    for (const r of overwritten) lines.push(row(r));
    lines.push('');
  }
  if (merged.length > 0) {
    lines.push(`Files to be merged (${merged.length}, additive — user content preserved):`);
    for (const r of merged) lines.push(row(r));
    lines.push('');
  }

  lines.push(`Plan written to ${outPath}`);
  lines.push('Next: review the plan, then run `janus retrofit --plan ' + outPath + '`');
  return lines.join('\n');
}
