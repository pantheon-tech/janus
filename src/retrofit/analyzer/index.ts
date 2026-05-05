import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { validateMarker } from '../schema/validate.js';
import type {
  JanusMarker,
  PackageJsonSnapshot,
  RepoSnapshot,
  WorkflowFile,
} from '../types/index.js';
import { analyzeClaudeKit } from './claude-kit.js';
import { analyzeDisplacedTools } from './displaced-tools.js';
import { analyzeGitState } from './git-state.js';
import { analyzePackageManager } from './package-manager.js';
import { analyzePluginEvidence } from './plugin-evidence.js';

// v0.1 unrecognized-tools allowlist FALLBACK. The canonical source lives in
// docs/conventions/dependencies.md and is loaded by `loadUnrecognizedToolsAllowlist`
// (see analyzer/unrecognized-tools-allowlist.ts) which Plan 5's CLI passes through
// via opts.unrecognizedToolsAllowlist. When the opt is absent (e.g. unit tests
// that don't supply a janusRoot), this hardcoded starter list is used.
const HARDCODED_UNRECOGNIZED_TOOLS_FALLBACK = [
  'lint-staged',
  'rome',
  'dprint',
  'standard',
  'xo',
  'changeset',
  '@changesets/cli',
  'turbo',
  'nx',
  'parcel',
  'rollup',
  'esbuild',
  'tsup',
];

const DISPLACED_TOOL_NAMES = ['eslint', 'prettier', 'husky', 'jest', 'commitlint', 'npm', 'yarn'];

export type AnalyzeOpts = {
  /**
   * Allowlist of tool names to surface in `unrecognized_tools`. When provided
   * (typically by Plan 5's CLI after calling `loadUnrecognizedToolsAllowlist`),
   * this overrides the hardcoded fallback. Pass `[]` to disable detection entirely.
   */
  unrecognizedToolsAllowlist?: string[];
};

export function analyze(
  repoRoot: string,
  opts?: AnalyzeOpts,
): Omit<RepoSnapshot, 'baseline_files'> {
  const pmResult = analyzePackageManager(repoRoot);
  const gitResult = analyzeGitState(repoRoot);
  const displaced_tools = analyzeDisplacedTools(repoRoot, pmResult.package_json);
  const claude_kit = analyzeClaudeKit(repoRoot);
  const plugin_evidence = analyzePluginEvidence(repoRoot, pmResult.package_json);
  const ci_workflows = listCiWorkflows(repoRoot);
  const { has_janus_marker, prior_marker } = readPriorMarker(repoRoot);
  const allowlist = new Set(
    opts?.unrecognizedToolsAllowlist ?? HARDCODED_UNRECOGNIZED_TOOLS_FALLBACK,
  );
  const unrecognized_tools = detectUnrecognizedTools(pmResult.package_json, allowlist);

  const out: Omit<RepoSnapshot, 'baseline_files'> = {
    repo_root: repoRoot,
    has_janus_marker,
    package_manager: pmResult.package_manager,
    lockfiles_present: pmResult.lockfiles_present,
    has_package_json: pmResult.has_package_json,
    displaced_tools,
    claude_kit,
    ci_workflows,
    unrecognized_tools,
    plugin_evidence,
    git: gitResult.git,
    remote: gitResult.remote,
  };
  if (prior_marker !== undefined) out.prior_marker = prior_marker;
  if (pmResult.package_json !== undefined) out.package_json = pmResult.package_json;
  if (pmResult.workspace !== undefined) out.workspace = pmResult.workspace;
  return out;
}

function readPriorMarker(repoRoot: string): {
  has_janus_marker: boolean;
  prior_marker?: JanusMarker;
} {
  const path = join(repoRoot, '.janus.json');
  if (!existsSync(path)) return { has_janus_marker: false };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    const result = validateMarker(parsed);
    if (result.ok) {
      return { has_janus_marker: true, prior_marker: result.value };
    }
  } catch {
    // fall through — present but malformed
  }
  return { has_janus_marker: true };
}

function listCiWorkflows(repoRoot: string): WorkflowFile[] {
  const dir = join(repoRoot, '.github/workflows');
  if (!existsSync(dir)) return [];
  const out: WorkflowFile[] = [];
  for (const entry of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(entry)) continue;
    const full = join(dir, entry);
    if (!statSync(full).isFile()) continue;
    const content = readFileSync(full, 'utf8');
    const refs: string[] = [];
    for (const tool of DISPLACED_TOOL_NAMES) {
      const re = new RegExp(`(^|[^a-zA-Z0-9_-])${tool}([^a-zA-Z0-9_-]|$)`);
      if (re.test(content)) refs.push(tool);
    }
    out.push({ path: relative(repoRoot, full), references_displaced_tool: refs.sort() });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

function detectUnrecognizedTools(
  pkg: PackageJsonSnapshot | undefined,
  allowlist: Set<string>,
): string[] {
  if (!pkg) return [];
  const found = new Set<string>();
  for (const deps of [pkg.devDependencies, pkg.dependencies]) {
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (allowlist.has(name)) found.add(name);
    }
  }
  return [...found].sort();
}
