import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { JanusError } from '../../errors.js';
import type { Operation } from '../../types/index.js';

// Hardcoded — claude_settings_merge always targets `.claude/settings.json`.
// The op type does not carry a `path` field; the location is invariant.
const SETTINGS_REL = '.claude/settings.json';

type HookEntry = {
  matcher?: string;
  hooks: Array<{ type: string; command: string; timeout?: number }>;
};

type Settings = Record<string, unknown> & {
  permissions?: { allow?: string[]; deny?: string[] };
  hooks?: Record<string, HookEntry[]>;
  enabledPlugins?: Record<string, boolean>;
};

const SCALAR_FIELDS = ['model', 'theme', 'cleanupPeriodDays'];

export async function applyClaudeSettingsMerge(
  op: Extract<Operation, { op: 'claude_settings_merge' }>,
  ctx: { repoRoot: string },
): Promise<void> {
  const full = join(ctx.repoRoot, SETTINGS_REL);
  let user: Settings = {};
  if (existsSync(full)) {
    if (op.pre_state_hash) {
      const actual = `sha256:${createHash('sha256').update(readFileSync(full)).digest('hex')}`;
      if (actual !== op.pre_state_hash) {
        throw new JanusError(
          'PRE_STATE_HASH_MISMATCH',
          `pre_state_hash mismatch on ${SETTINGS_REL}: expected ${op.pre_state_hash}, got ${actual}`,
        );
      }
    }
    user = JSON.parse(readFileSync(full, 'utf8')) as Settings;
  }
  const additions = op.additions as Settings;
  const merged: Settings = { ...user };

  // permissions.allow / .deny: append non-duplicate entries.
  if (additions.permissions) {
    const userPerms = merged.permissions ?? {};
    const mergedPerms: { allow?: string[]; deny?: string[] } = { ...userPerms };
    for (const k of ['allow', 'deny'] as const) {
      const userArr = userPerms[k] ?? [];
      const addArr = additions.permissions[k] ?? [];
      const out = [...userArr];
      for (const e of addArr) if (!userArr.includes(e)) out.push(e);
      mergedPerms[k] = out;
    }
    merged.permissions = mergedPerms;
  }

  // hooks: append per (matcher, command) identity.
  if (additions.hooks) {
    const userHooks = merged.hooks ?? {};
    const mergedHooks: Record<string, HookEntry[]> = { ...userHooks };
    for (const [event, addEntries] of Object.entries(additions.hooks)) {
      const existing = userHooks[event] ?? [];
      const out: HookEntry[] = [...existing];
      for (const addEntry of addEntries) {
        const addCommand = addEntry.hooks[0]?.command ?? '';
        const exists = existing.some(
          (e) =>
            (e.matcher ?? '') === (addEntry.matcher ?? '') && e.hooks[0]?.command === addCommand,
        );
        if (!exists) out.push(addEntry);
      }
      mergedHooks[event] = out;
    }
    merged.hooks = mergedHooks;
  }

  // enabledPlugins: shallow merge — janus wins.
  if (additions.enabledPlugins) {
    merged.enabledPlugins = { ...(merged.enabledPlugins ?? {}), ...additions.enabledPlugins };
  }

  // Top-level scalars: user wins if set.
  for (const k of SCALAR_FIELDS) {
    if (additions[k] !== undefined && merged[k] === undefined) merged[k] = additions[k];
  }

  // Other top-level fields janus brings: env, worktree.
  for (const k of ['env', 'worktree']) {
    if (additions[k] !== undefined && merged[k] === undefined) merged[k] = additions[k];
  }

  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(merged, null, 2)}\n`);
}
