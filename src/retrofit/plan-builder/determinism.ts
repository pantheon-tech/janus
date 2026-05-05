import { createHash } from 'node:crypto';
import type { Plan, Sha256 } from '../types/index.js';

const CATEGORY_ORDER: Record<string, number> = {
  'displace-tools': 1,
  'set-package-manager': 2,
  'apply-shared-overlay': 3,
  'apply-archetype-overlay': 4,
  'merge-claude-kit': 5,
  'install-deps': 6,
  'write-marker': 7,
};

export function sortSteps(steps: Plan['payload']['steps']): Plan['payload']['steps'] {
  return [...steps].sort((a, b) => {
    const ac = CATEGORY_ORDER[a.category] ?? 99;
    const bc = CATEGORY_ORDER[b.category] ?? 99;
    if (ac !== bc) return ac - bc;
    return a.id.localeCompare(b.id);
  });
}

export function sortWarnings(warnings: Plan['payload']['warnings']): Plan['payload']['warnings'] {
  return [...warnings].sort((a, b) => {
    if (a.code !== b.code) return a.code.localeCompare(b.code);
    const ae = a.evidence[0] ?? '';
    const be = b.evidence[0] ?? '';
    if (ae !== be) return ae.localeCompare(be);
    return a.message.localeCompare(b.message);
  });
}

export function sortCommitPaths(paths: string[]): string[] {
  return [...paths].sort();
}

/**
 * Canonical JSON serialization with sorted keys at every depth.
 * Arrays preserve insertion order (semantically meaningful per §6.6).
 */
export function canonicalizePayload(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function hashPayload(payload: unknown): Sha256 {
  const hex = createHash('sha256').update(canonicalizePayload(payload), 'utf8').digest('hex');
  return `sha256:${hex}` as Sha256;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return sorted;
  }
  return value;
}
