import { execFileSync } from 'node:child_process';
import type { RepoSnapshot } from '../types/index.js';
import { normalizeNodeVersion, validateSlot } from './slot-validation.js';

export type SlotKey =
  | 'workload'
  | 'description'
  | 'archetype'
  | 'github_org'
  | 'author'
  | 'author_email'
  | 'node_version'
  | 'license'
  | 'region'
  | 'template_version'
  | 'year'
  | 'date'
  | 'base_branch';

export type SlotMap = Record<SlotKey, string>;

export type ResolveSlotsOpts = {
  snapshot: Omit<RepoSnapshot, 'baseline_files'>;
  archetype: string;
  cliSlots: Partial<Record<SlotKey, string>>;
  nonInteractive: boolean;
  prompt?: (key: SlotKey) => Promise<string>;
  /** janus_version, used to default template_version. */
  janusVersion?: string;
  /** UTC clock injection — pass for deterministic tests. */
  now?: Date;
};

const ALL_SLOTS: SlotKey[] = [
  'workload',
  'description',
  'archetype',
  'github_org',
  'author',
  'author_email',
  'node_version',
  'license',
  'region',
  'template_version',
  'year',
  'date',
  'base_branch',
];

const STATIC_DEFAULTS = (now: Date, version: string): Partial<SlotMap> => ({
  description: '',
  license: 'MIT',
  region: 'australiaeast',
  node_version: '24',
  template_version: `v${version}`,
  year: String(now.getUTCFullYear()),
  date: now.toISOString().slice(0, 10),
  base_branch: 'staging',
});

export async function resolveSlots(opts: ResolveSlotsOpts): Promise<SlotMap> {
  const now = opts.now ?? new Date();
  const version = opts.janusVersion ?? '0.1.0';
  const prior = opts.snapshot.prior_marker;
  const auto = autoSource(opts.snapshot, opts.archetype);
  const defaults = STATIC_DEFAULTS(now, version);

  const resolved: Partial<SlotMap> = {};

  for (const key of ALL_SLOTS) {
    // 4. CLI override takes precedence (validated; fail-fast on bad value).
    if (opts.cliSlots[key] !== undefined && opts.cliSlots[key] !== '') {
      const v = opts.cliSlots[key]!;
      const v2 = key === 'node_version' ? (normalizeNodeVersion(v) ?? v) : v;
      const validation = validateSlot(key, v2);
      if (!validation.ok) {
        throw new Error(`SLOT_VALIDATION_FAILED: ${validation.reason}`);
      }
      resolved[key] = v2;
      continue;
    }

    // 1. Prior marker.
    const fromPrior = prior?.slots?.[key];
    if (fromPrior !== undefined && fromPrior !== '' && validateSlot(key, fromPrior).ok) {
      resolved[key] = fromPrior;
      continue;
    }

    // 2. Auto-source.
    const fromAuto = auto[key];
    if (fromAuto !== undefined && fromAuto !== '' && validateSlot(key, fromAuto).ok) {
      resolved[key] = fromAuto;
      continue;
    }

    const fromDefault = defaults[key];

    // 3. Prompt or fail.
    if (opts.nonInteractive || !opts.prompt) {
      if (fromDefault !== undefined) {
        resolved[key] = fromDefault;
        continue;
      }
      throw new Error(`SLOT_UNRESOLVED_NON_INTERACTIVE: ${key}`);
    }

    // Interactive: prompt comes before the static default, but defaults rescue
    // a prompt that returns empty/invalid (3 attempts) so callbacks that decline
    // a slot still get a sensible value (e.g., license=MIT).
    let attempts = 0;
    while (attempts < 3) {
      const promptedRaw = (await opts.prompt(key)).trim();
      const prompted =
        key === 'node_version' ? (normalizeNodeVersion(promptedRaw) ?? promptedRaw) : promptedRaw;
      if (prompted && validateSlot(key, prompted).ok) {
        resolved[key] = prompted;
        break;
      }
      attempts++;
    }
    if (resolved[key] === undefined) {
      if (fromDefault !== undefined) {
        resolved[key] = fromDefault;
        continue;
      }
      throw new Error(`SLOT_UNRESOLVED_NON_INTERACTIVE: ${key} (prompt failed validation 3 times)`);
    }
  }

  return resolved as SlotMap;
}

function autoSource(
  snap: Omit<RepoSnapshot, 'baseline_files'>,
  archetype: string,
): Partial<Record<SlotKey, string>> {
  const out: Partial<Record<SlotKey, string>> = { archetype };
  if (snap.remote.parsed) {
    out.github_org = snap.remote.parsed.org;
    out.workload = snap.remote.parsed.repo;
  }
  if (snap.package_json) {
    const author = snap.package_json.author;
    if (typeof author === 'string') {
      const m = author.match(/^(.+?)\s*<\s*([^>]+?)\s*>\s*$/);
      if (m) {
        out.author = m[1]!.trim();
        out.author_email = m[2]!.trim();
      } else if (author.trim()) {
        out.author = author.trim();
      }
    } else if (author && typeof author === 'object') {
      if (author.name) out.author = author.name;
      if (author.email) out.author_email = author.email;
    }
    if (snap.package_json.description?.trim()) {
      out.description = snap.package_json.description;
    }
    const engineNode = snap.package_json.engines?.node;
    if (engineNode) {
      const norm = normalizeNodeVersion(engineNode);
      if (norm) out.node_version = norm;
    }
  }
  if (!out.author) {
    const v = readGitConfig(snap.repo_root, 'user.name');
    if (v) out.author = v;
  }
  if (!out.author_email) {
    const v = readGitConfig(snap.repo_root, 'user.email');
    if (v) out.author_email = v;
  }
  return out;
}

function readGitConfig(repoRoot: string, key: string): string | undefined {
  try {
    return execFileSync('git', ['config', '--get', key], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString('utf8')
      .trim();
  } catch {
    return undefined;
  }
}
