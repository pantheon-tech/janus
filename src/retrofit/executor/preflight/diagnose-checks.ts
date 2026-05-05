import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { JanusError } from '../../errors.js';
import { validateMarker } from '../../schema/validate.js';

const ARCHETYPES = new Set([
  'generic-ts',
  'backend-functions',
  'backend-container-app',
  'frontend-vite-react',
  'mcp-server',
  'monorepo-root',
]);

const REQUIRED_TOOLS_DIAGNOSE = ['git', 'jq', 'node'];

export async function runDiagnoseChecks(repoRoot: string, archetype: string): Promise<void> {
  // #1 cwd inside a git repository
  let topLevel: string;
  try {
    topLevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString('utf8')
      .trim();
  } catch {
    throw new JanusError('NOT_IN_GIT_REPO', `${repoRoot} is not inside a git repository`);
  }

  // #2 archetype known
  if (!ARCHETYPES.has(archetype)) {
    throw new JanusError('INVALID_ARCHETYPE', `unknown archetype: ${archetype}`);
  }

  // #3 .janus.json validity if present
  const markerPath = join(topLevel, '.janus.json');
  if (existsSync(markerPath)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(markerPath, 'utf8'));
    } catch (e) {
      throw new JanusError(
        'MARKER_INVALID',
        `.janus.json is not valid JSON: ${(e as Error).message}`,
      );
    }
    const r = validateMarker(parsed);
    if (!r.ok) {
      throw new JanusError(
        'MARKER_INVALID',
        `marker schema validation failed: ${r.errors.join('; ')}`,
      );
    }
    if (r.value.schema_version !== '1') {
      throw new JanusError(
        'MARKER_INVALID',
        `marker schema_version=${r.value.schema_version}, supported=1`,
      );
    }
  }

  // #4 required tools
  for (const tool of REQUIRED_TOOLS_DIAGNOSE) {
    try {
      execFileSync(tool, ['--version'], { stdio: 'pipe' });
    } catch {
      throw new JanusError('TOOL_MISSING', `required tool not found on PATH: ${tool}`);
    }
  }

  // #5 no submodules
  const modulesPath = join(topLevel, '.gitmodules');
  if (existsSync(modulesPath) && statSync(modulesPath).size > 0) {
    throw new JanusError('HAS_SUBMODULES', `.gitmodules present at ${modulesPath}`);
  }

  // #8 monorepo-root from workspace member?
  // Two ways to detect: (a) cwd is not the git toplevel and pnpm-workspace.yaml lives at
  // some ancestor; or (b) cwd IS the toplevel but cwd is itself a workspace member of an
  // outer workspace. We resolve the supplied repoRoot to an absolute path and compare to
  // the git toplevel.
  if (archetype === 'monorepo-root') {
    const resolvedRepoRoot = execFileSync('git', ['rev-parse', '--show-cdup'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .toString('utf8')
      .trim();
    const cwdIsToplevel = resolvedRepoRoot === '';
    const ancestorWs = findAncestorWorkspace(repoRoot);
    if (!cwdIsToplevel && ancestorWs) {
      throw new JanusError(
        'INVOKED_FROM_WORKSPACE_MEMBER',
        `pnpm-workspace.yaml found at ancestor ${ancestorWs}; cannot retrofit from workspace member ${repoRoot}`,
        `cd ${ancestorWs} and re-run`,
      );
    }
  }
}

function findAncestorWorkspace(start: string): string | undefined {
  let cur = start;
  while (true) {
    if (existsSync(join(cur, 'pnpm-workspace.yaml'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return undefined;
    cur = parent;
  }
}
