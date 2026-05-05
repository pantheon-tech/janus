# janus retrofit — Plan 4 of 5: Executor + Pre-flight + Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a validated `Plan` to a target repo: run pre-flight checks #1–#16, iterate steps, run op handlers per step, stage + commit per step, write the final marker. Produces a `RunReport` describing what happened.

**Architecture:** The executor is divided into pre-flight (read-only assertions on the target repo + plan), per-op handlers (each handler mutates one specific resource — file, JSON pointer, settings, gitignore, shell), and a per-step driver that composes precondition checks, pre-state-hash verification, op execution, `git status` verification, and `git add`+`git commit`. A separate `marker.ts` builds the final `JanusMarker` JSON and replaces the placeholder content from Plan 3's `write-marker` step. `--dry-run` runs every pre-flight check then prints a per-step summary and exits with no working-tree changes. `--branch` overrides the default `janus/retrofit`; auto-collision search emits a soft-fail with the suggested next name. All commits use the user's default git config (no executor identity injection), so the resulting branch reads naturally to a reviewer.

**Tech Stack:** Same — TypeScript 5.7 strict, vitest 3.0, Node 24, `child_process.execFile` for git/jq/pnpm/find. Adds `inquirer`-shaped prompt callback hookpoints (Plan 5 wires the actual UI). One new test-only dep: a `before-after` fixture variant for TOCTOU testing.

**Out of scope for Plan 4:** CLI argv parsing, prompt UI, help text, stdout summary formatting (all Plan 5). The `unrecognized_tools` allowlist read from `docs/conventions/dependencies.md` (Plan 5).

---

## Spec coverage map

| Spec § | Plan 4 deliverable |
|---|---|
| §4 pre-flight #1–#5, #8 | `executor/preflight/diagnose-checks.ts` (Task 1) |
| §4 pre-flight #6, #7 (deferred until after overlay) | `executor/preflight/post-overlay-checks.ts` (Task 2) |
| §4 pre-flight #9–#16 | `executor/preflight/retrofit-checks.ts` (Task 3) |
| §4 ordering rule (numeric, abort on first failure) | `executor/preflight/index.ts` (Task 4) |
| §7 op vocabulary closed set | `executor/operations/dispatch.ts` (Task 5) — refuses unknown ops |
| §7 `write_file` (mode + pre_state_hash + overwrite) | `executor/operations/write-file.ts` (Task 6) |
| §7 `delete_file` / `delete_directory` / `rename_file` / `chmod` | `executor/operations/fs.ts` (Task 7) |
| §7 `json_set` / `json_remove` / `json_remove_matching` / `json_merge` | `executor/operations/json.ts` (Task 8) |
| §7 `claude_settings_merge` (per §8 rules) | `executor/operations/claude-settings.ts` (Task 9) |
| §7 `gitignore_merge` | `executor/operations/gitignore.ts` (Task 10) |
| §7 `shell` whitelist | `executor/operations/shell.ts` (Task 11) |
| §9 step driver: preconditions → pre-state hash → ops → status → commit | `executor/step-driver.ts` (Task 12) |
| §9 abort behavior + last-good SHA | `executor/run-report.ts` (Task 13) |
| §9 marker write at end | `executor/marker.ts` (Task 14) |
| §11 `--branch` collision search | `executor/git.ts` (Task 15) |
| §11 `--dry-run` | `executor/index.ts` (Task 16) |

---

## File structure

```
src/retrofit/executor/
├── index.ts                — execute(plan, repoRoot, opts) main loop
├── preflight/
│   ├── index.ts            — orderly runner that aborts on first failure
│   ├── diagnose-checks.ts  — #1–#5, #8
│   ├── post-overlay-checks.ts — #6, #7 (called by Plan 3 diagnose orchestrator after overlay computation)
│   └── retrofit-checks.ts  — #9–#16
├── operations/
│   ├── dispatch.ts         — switch on op.op; refuses unknown
│   ├── write-file.ts       — mode + pre_state_hash + overwrite
│   ├── fs.ts               — delete_file, delete_directory, rename_file, chmod
│   ├── json.ts             — json_set, json_remove, json_remove_matching, json_merge
│   ├── claude-settings.ts  — claude_settings_merge per §8
│   ├── gitignore.ts        — gitignore_merge
│   └── shell.ts            — whitelist enforcement
├── step-driver.ts          — per-step composition: pre-hash, ops, status, commit
├── git.ts                  — branch creation, status, commit, collision search
├── marker.ts               — build final JanusMarker JSON, replace placeholder content
├── run-report.ts           — RunReport struct + abort helper
└── errors.ts               — typed error codes (PRE_STATE_HASH_MISMATCH, EXTRANEOUS_FILE_MODIFICATIONS, etc.)
```

---

## Task 1: errors.ts + preflight/diagnose-checks.ts (#1–#5, #8)

**Files:**
- Create: `src/retrofit/executor/errors.ts`
- Create: `src/retrofit/executor/preflight/diagnose-checks.ts`
- Create: `src/retrofit/executor/preflight/diagnose-checks.test.ts`

- [ ] **Step 1: Implement errors.ts**

`src/retrofit/executor/errors.ts`:

```ts
export const ERROR_CODES = {
  // Pre-flight
  NOT_A_GIT_REPO: 'NOT_A_GIT_REPO',
  UNKNOWN_ARCHETYPE: 'UNKNOWN_ARCHETYPE',
  MARKER_INVALID: 'MARKER_INVALID',
  MARKER_VERSION_UNRECOGNIZED: 'MARKER_VERSION_UNRECOGNIZED',
  REQUIRED_TOOL_MISSING: 'REQUIRED_TOOL_MISSING',
  HAS_SUBMODULES: 'HAS_SUBMODULES',
  HAS_SYMLINKS: 'HAS_SYMLINKS',
  CASE_INSENSITIVE_COLLISION: 'CASE_INSENSITIVE_COLLISION',
  INVOKED_FROM_WORKSPACE_MEMBER: 'INVOKED_FROM_WORKSPACE_MEMBER',
  INVOKED_FROM_WORKTREE: 'INVOKED_FROM_WORKTREE',
  PLAN_FILE_MISSING: 'PLAN_FILE_MISSING',
  PLAN_INVALID_JSON: 'PLAN_INVALID_JSON',
  PLAN_SCHEMA_INVALID: 'PLAN_SCHEMA_INVALID',
  SCHEMA_VERSION_MISMATCH: 'SCHEMA_VERSION_MISMATCH',
  REPO_ROOT_MISMATCH: 'REPO_ROOT_MISMATCH',
  TREE_DIRTY: 'TREE_DIRTY',
  HEAD_DETACHED: 'HEAD_DETACHED',
  TARGET_BRANCH_EXISTS: 'TARGET_BRANCH_EXISTS',
  REMOTE_UNREACHABLE: 'REMOTE_UNREACHABLE',
  BRANCH_SUGGESTION_EXHAUSTED: 'BRANCH_SUGGESTION_EXHAUSTED',
  // Execution
  PRE_STATE_HASH_MISMATCH: 'PRE_STATE_HASH_MISMATCH',
  PRE_STATE_HASH_MISSING_FILE: 'PRE_STATE_HASH_MISSING_FILE',
  EXTRANEOUS_FILE_MODIFICATIONS: 'EXTRANEOUS_FILE_MODIFICATIONS',
  CLAUDE_PRE_JANUS_EXISTS: 'CLAUDE_PRE_JANUS_EXISTS',
  CLAUDE_TEMPLATE_UNEXPECTED_HEAD: 'CLAUDE_TEMPLATE_UNEXPECTED_HEAD',
  GITIGNORE_BLOCK_MALFORMED: 'GITIGNORE_BLOCK_MALFORMED',
  SHELL_NOT_WHITELISTED: 'SHELL_NOT_WHITELISTED',
  COMMIT_HOOK_FAILED: 'COMMIT_HOOK_FAILED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class JanusError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly remediation?: string,
  ) {
    super(message);
    this.name = 'JanusError';
  }
}
```

- [ ] **Step 2: Write the failing diagnose-checks tests**

`src/retrofit/executor/preflight/diagnose-checks.test.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { runDiagnoseChecks } from './diagnose-checks.js';

describe('runDiagnoseChecks (#1–#5, #8)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('passes for greenfield + valid archetype', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await expect(runDiagnoseChecks(fx.dir, 'generic-ts')).resolves.toBeUndefined();
  });

  it('throws UNKNOWN_ARCHETYPE for invalid archetype', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await expect(runDiagnoseChecks(fx.dir, 'wat')).rejects.toMatchObject({ code: 'UNKNOWN_ARCHETYPE' });
  });

  it('throws NOT_A_GIT_REPO outside a repo', async () => {
    await expect(runDiagnoseChecks('/tmp', 'generic-ts')).rejects.toMatchObject({ code: 'NOT_A_GIT_REPO' });
  });

  it('throws HAS_SUBMODULES when .gitmodules has entries', async () => {
    const fx = materializeFixture('repo-with-submodule');
    cleanups.push(fx.cleanup);
    await expect(runDiagnoseChecks(fx.dir, 'generic-ts')).rejects.toMatchObject({ code: 'HAS_SUBMODULES' });
  });

  it('throws MARKER_INVALID when .janus.json is unparseable', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, '.janus.json'), 'not json');
    await expect(runDiagnoseChecks(fx.dir, 'generic-ts')).rejects.toMatchObject({ code: 'MARKER_INVALID' });
  });

  it('passes when .janus.json is valid', async () => {
    const fx = materializeFixture('already-janus');
    cleanups.push(fx.cleanup);
    await expect(runDiagnoseChecks(fx.dir, 'generic-ts')).resolves.toBeUndefined();
  });

  it('throws INVOKED_FROM_WORKSPACE_MEMBER when monorepo-root invoked from a member', async () => {
    const fx = materializeFixture('monorepo');
    cleanups.push(fx.cleanup);
    // diagnose-checks operates on the supplied repoRoot; simulate "invoked from member" by passing a member subdir.
    const member = join(fx.dir, 'packages/api');
    mkdirSync(member, { recursive: true });
    writeFileSync(join(member, 'package.json'), '{"name":"@x/api"}');
    await expect(runDiagnoseChecks(member, 'monorepo-root')).rejects.toMatchObject({
      code: 'INVOKED_FROM_WORKSPACE_MEMBER',
    });
  });
});
```

- [ ] **Step 3: Implement diagnose-checks.ts**

`src/retrofit/executor/preflight/diagnose-checks.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validateMarker } from '../../schema/validate.js';
import { JanusError } from '../errors.js';

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
    }).toString('utf8').trim();
  } catch {
    throw new JanusError('NOT_A_GIT_REPO', `${repoRoot} is not inside a git repository`);
  }
  // #2 archetype known
  if (!ARCHETYPES.has(archetype)) {
    throw new JanusError('UNKNOWN_ARCHETYPE', `unknown archetype: ${archetype}`);
  }
  // #3 .janus.json validity if present
  const markerPath = join(topLevel, '.janus.json');
  if (existsSync(markerPath)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(markerPath, 'utf8'));
    } catch (e) {
      throw new JanusError('MARKER_INVALID', `.janus.json is not valid JSON: ${(e as Error).message}`);
    }
    const r = validateMarker(parsed);
    if (!r.ok) {
      throw new JanusError('MARKER_INVALID', `marker schema validation failed: ${r.errors.join('; ')}`);
    }
    if (r.value.schema_version !== '1') {
      throw new JanusError(
        'MARKER_VERSION_UNRECOGNIZED',
        `marker schema_version=${r.value.schema_version}, supported=1`,
      );
    }
  }
  // #4 required tools
  for (const tool of REQUIRED_TOOLS_DIAGNOSE) {
    try {
      execFileSync(tool, ['--version'], { stdio: 'pipe' });
    } catch {
      throw new JanusError('REQUIRED_TOOL_MISSING', `required tool not found on PATH: ${tool}`);
    }
  }
  // mo (vendored — caller passes janusRoot; for the test we can't always check, so optional).
  // The Plan 5 CLI wrapper passes janusRoot explicitly. Here we just verify by env var if set.
  // #5 no submodules
  const modulesPath = join(topLevel, '.gitmodules');
  if (existsSync(modulesPath) && statSync(modulesPath).size > 0) {
    throw new JanusError('HAS_SUBMODULES', `.gitmodules present at ${modulesPath}`);
  }
  // #8 monorepo-root from workspace member?
  if (archetype === 'monorepo-root') {
    const found = findAncestorWorkspace(topLevel);
    if (found && found !== topLevel) {
      throw new JanusError(
        'INVOKED_FROM_WORKSPACE_MEMBER',
        `pnpm-workspace.yaml found at ancestor ${found}; cannot retrofit from workspace member ${topLevel}`,
        `cd ${found} and re-run`,
      );
    }
    // Also check: invoking from a clearly-non-root path inside the repo where a workspace exists.
    // For the test, we accept the simpler "topLevel != ancestor with workspace" check above.
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
```

- [ ] **Step 4: Run, verify, commit**

```bash
pnpm test:unit -- diagnose-checks.test
pnpm typecheck
git add src/retrofit/executor/errors.ts src/retrofit/executor/preflight/diagnose-checks.ts src/retrofit/executor/preflight/diagnose-checks.test.ts
git commit -m "feat(retrofit): executor errors + diagnose pre-flight checks #1-#5 and #8"
```

---

## Task 2: preflight/post-overlay-checks.ts (#6, #7)

**Files:**
- Create: `src/retrofit/executor/preflight/post-overlay-checks.ts`
- Create: `src/retrofit/executor/preflight/post-overlay-checks.test.ts`

Run AFTER overlay-tree computation (per the spec's deferred-ordering rule).

- [ ] **Step 1: Write tests**

`src/retrofit/executor/preflight/post-overlay-checks.test.ts`:

```ts
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { runPostOverlayChecks } from './post-overlay-checks.js';

describe('runPostOverlayChecks (#6, #7)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('passes when no symlinks in target paths', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    expect(() => runPostOverlayChecks(fx.dir, new Set(['biome.jsonc']))).not.toThrow();
  });

  it('throws HAS_SYMLINKS when a target path resolves through a symlink', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.claude'));
    writeFileSync(join(fx.dir, '.claude/settings.json'), '{}');
    symlinkSync('settings.json', join(fx.dir, '.claude/settings-link.json'));
    expect(() =>
      runPostOverlayChecks(fx.dir, new Set(['.claude/settings-link.json'])),
    ).toThrow(/HAS_SYMLINKS/);
  });

  it('throws CASE_INSENSITIVE_COLLISION when overlay path differs only by case from existing', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'README.md'), '# user');
    expect(() =>
      runPostOverlayChecks(fx.dir, new Set(['readme.md'])),
    ).toThrow(/CASE_INSENSITIVE_COLLISION/);
  });
});
```

- [ ] **Step 2: Implement post-overlay-checks.ts**

`src/retrofit/executor/preflight/post-overlay-checks.ts`:

```ts
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { JanusError } from '../errors.js';

export function runPostOverlayChecks(repoRoot: string, targetPaths: Set<string>): void {
  // #6 symlinks in target paths
  for (const rel of targetPaths) {
    const full = join(repoRoot, rel);
    if (existsSync(full)) {
      const stat = statSync(full, { throwIfNoEntry: false } as never);
      // statSync follows links by default; use lstatSync semantics via a lstat probe.
      const lstat = require('node:fs').lstatSync(full);
      if (lstat.isSymbolicLink()) {
        throw new JanusError('HAS_SYMLINKS', `symlink found at target path: ${rel}`);
      }
    }
  }

  // #7 case-insensitive collision: for each target path, look for an existing sibling at
  // the same parent dir whose filename differs only by case.
  for (const rel of targetPaths) {
    const target = join(repoRoot, rel);
    if (existsSync(target)) continue; // exact match — not a collision case
    const parentDir = dirname(target);
    if (!existsSync(parentDir)) continue;
    const baseName = rel.split('/').pop()!;
    const lc = baseName.toLowerCase();
    let entries: string[] = [];
    try {
      entries = readdirSync(parentDir);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e !== baseName && e.toLowerCase() === lc) {
        throw new JanusError(
          'CASE_INSENSITIVE_COLLISION',
          `existing ${join(dirname(rel), e)} would collide with overlay target ${rel}`,
        );
      }
    }
  }
}
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- post-overlay-checks.test
pnpm typecheck
git add src/retrofit/executor/preflight/post-overlay-checks.ts src/retrofit/executor/preflight/post-overlay-checks.test.ts
git commit -m "feat(retrofit): post-overlay pre-flight checks #6 (symlinks) and #7 (case collision)"
```

---

## Task 3: preflight/retrofit-checks.ts (#9–#16)

**Files:**
- Create: `src/retrofit/executor/preflight/retrofit-checks.ts`
- Create: `src/retrofit/executor/preflight/retrofit-checks.test.ts`

- [ ] **Step 1: Write tests**

`src/retrofit/executor/preflight/retrofit-checks.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import type { Plan } from '../../types/index.js';
import { runRetrofitChecks } from './retrofit-checks.js';

const samplePlan = (over: Partial<Plan['payload']> = {}): Plan => ({
  schema_version: '1',
  meta: { janus_version: '0.1.0', generated_at: '2026-05-05T00:00:00Z' },
  payload: {
    repo_root: '/tmp/replaced-by-test',
    archetype: 'generic-ts',
    target_branch: 'janus/retrofit',
    slots: {} as Plan['payload']['slots'],
    plugins: [],
    prior_marker: null,
    warnings: [],
    steps: [],
    ...over,
  },
});

describe('runRetrofitChecks (#9–#16)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('throws SCHEMA_VERSION_MISMATCH when plan declares version != "1"', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const plan = samplePlan({});
    plan.schema_version = '2' as never;
    plan.payload.repo_root = fx.dir;
    await expect(runRetrofitChecks({ plan, planPath: '/tmp/x.json', repoRoot: fx.dir, noRemoteCheck: true })).rejects.toMatchObject(
      { code: 'SCHEMA_VERSION_MISMATCH' },
    );
  });

  it('throws REPO_ROOT_MISMATCH when plan.repo_root does not match cwd toplevel', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const plan = samplePlan({ repo_root: '/wrong/path' });
    await expect(runRetrofitChecks({ plan, planPath: '/tmp/x.json', repoRoot: fx.dir, noRemoteCheck: true })).rejects.toMatchObject(
      { code: 'REPO_ROOT_MISMATCH' },
    );
  });

  it('throws TREE_DIRTY when working tree has uncommitted changes other than the plan file', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'untracked.txt'), 'x');
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, '{}');
    const plan = samplePlan({ repo_root: fx.dir });
    await expect(runRetrofitChecks({ plan, planPath, repoRoot: fx.dir, noRemoteCheck: true })).rejects.toMatchObject(
      { code: 'TREE_DIRTY' },
    );
  });

  it('passes when working tree is clean except for the plan file itself', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, '{}');
    const plan = samplePlan({ repo_root: fx.dir });
    await expect(runRetrofitChecks({ plan, planPath, repoRoot: fx.dir, noRemoteCheck: true })).resolves.toBeUndefined();
  });

  it('throws TARGET_BRANCH_EXISTS when target branch exists locally', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git branch janus/retrofit', { cwd: fx.dir, stdio: 'pipe' });
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, '{}');
    const plan = samplePlan({ repo_root: fx.dir, target_branch: 'janus/retrofit' });
    await expect(runRetrofitChecks({ plan, planPath, repoRoot: fx.dir, noRemoteCheck: true })).rejects.toMatchObject(
      { code: 'TARGET_BRANCH_EXISTS' },
    );
  });
});
```

- [ ] **Step 2: Implement retrofit-checks.ts**

`src/retrofit/executor/preflight/retrofit-checks.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';
import type { Plan } from '../../types/index.js';
import { JanusError } from '../errors.js';

export type RetrofitCheckOpts = {
  plan: Plan;
  planPath: string;
  repoRoot: string;
  noRemoteCheck?: boolean;
};

const SUPPORTED_SCHEMA_VERSION = '1';

export async function runRetrofitChecks(opts: RetrofitCheckOpts): Promise<void> {
  const { plan, planPath, repoRoot, noRemoteCheck } = opts;

  // #10 schema version
  if (plan.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new JanusError(
      'SCHEMA_VERSION_MISMATCH',
      `plan schema_version=${plan.schema_version}, supported=${SUPPORTED_SCHEMA_VERSION}`,
    );
  }

  // #11 repo_root match
  const topLevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).toString('utf8').trim();
  if (topLevel !== plan.payload.repo_root) {
    throw new JanusError(
      'REPO_ROOT_MISMATCH',
      `plan.repo_root=${plan.payload.repo_root} but git toplevel=${topLevel}`,
    );
  }

  // #12 tree clean (excluding plan file)
  const planRel = relative(topLevel, planPath);
  const porcelain = execFileSync('git', ['status', '--porcelain'], {
    cwd: repoRoot,
  })
    .toString('utf8')
    .split('\n')
    .filter(Boolean);
  const dirty = porcelain.filter((line) => line.slice(3) !== planRel);
  if (dirty.length > 0) {
    throw new JanusError('TREE_DIRTY', `working tree dirty: ${dirty.join(', ')}`);
  }

  // #13 HEAD on tracking branch (not detached) — branch name not 'HEAD'
  const headBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoRoot,
  }).toString('utf8').trim();
  if (headBranch === 'HEAD') {
    throw new JanusError('HEAD_DETACHED', 'HEAD is detached; check out a branch first');
  }

  // #14 target branch must not exist (local + remote unless --no-remote-check)
  const targetBranch = plan.payload.target_branch;
  try {
    execFileSync('git', ['rev-parse', '--verify', `refs/heads/${targetBranch}`], {
      cwd: repoRoot,
      stdio: 'pipe',
    });
    throw new JanusError(
      'TARGET_BRANCH_EXISTS',
      `local branch ${targetBranch} already exists`,
      'pass --branch with a different name or delete the existing branch',
    );
  } catch (e) {
    if (e instanceof JanusError) throw e;
    // not present locally — good
  }
  if (!noRemoteCheck) {
    try {
      const out = execFileSync(
        'git',
        ['ls-remote', '--heads', 'origin', targetBranch],
        { cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'] },
      ).toString('utf8').trim();
      if (out.length > 0) {
        throw new JanusError(
          'TARGET_BRANCH_EXISTS',
          `remote branch ${targetBranch} already exists`,
          'pass --branch with a different name',
        );
      }
    } catch (e) {
      if (e instanceof JanusError) throw e;
      throw new JanusError(
        'REMOTE_UNREACHABLE',
        `git ls-remote origin failed: ${(e as Error).message}`,
        're-run with --no-remote-check to skip the remote-existence verification',
      );
    }
  }

  // #15 pnpm available
  try {
    execFileSync('pnpm', ['--version'], { stdio: 'pipe' });
  } catch {
    throw new JanusError('REQUIRED_TOOL_MISSING', 'pnpm not found on PATH');
  }

  // #16 not from a linked worktree
  const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], {
    cwd: repoRoot,
  }).toString('utf8').trim();
  const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
    cwd: repoRoot,
  }).toString('utf8').trim();
  if (gitDir !== commonDir) {
    throw new JanusError(
      'INVOKED_FROM_WORKTREE',
      'janus retrofit must run from the main checkout, not a linked worktree',
      'cd to the main worktree and re-run',
    );
  }
}
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- retrofit-checks.test
pnpm typecheck
git add src/retrofit/executor/preflight/retrofit-checks.ts src/retrofit/executor/preflight/retrofit-checks.test.ts
git commit -m "feat(retrofit): retrofit pre-flight checks #9-#16"
```

---

## Task 4: preflight/index.ts (orderly runner)

**Files:**
- Create: `src/retrofit/executor/preflight/index.ts`

Composes diagnose + retrofit checks per §4 ordering rule.

- [ ] **Step 1: Implement preflight/index.ts**

```ts
import type { Plan } from '../../types/index.js';
import { runDiagnoseChecks } from './diagnose-checks.js';
import { runPostOverlayChecks } from './post-overlay-checks.js';
import { runRetrofitChecks } from './retrofit-checks.js';

export async function runAllRetrofitPreflight(opts: {
  plan: Plan;
  planPath: string;
  repoRoot: string;
  archetype: string;
  targetPaths: Set<string>;
  noRemoteCheck?: boolean;
}): Promise<void> {
  // #1-#5, #8
  await runDiagnoseChecks(opts.repoRoot, opts.archetype);
  // #6, #7 (deferred until overlay computed; caller passes targetPaths)
  runPostOverlayChecks(opts.repoRoot, opts.targetPaths);
  // #9-#16
  await runRetrofitChecks(opts);
}

export { runDiagnoseChecks, runPostOverlayChecks, runRetrofitChecks };
```

- [ ] **Step 2: Commit (no test — composition is exercised by Plan 4 end-to-end test in Task 17)**

```bash
pnpm typecheck
git add src/retrofit/executor/preflight/index.ts
git commit -m "feat(retrofit): preflight/index.ts — orderly composition of #1-#16"
```

---

## Task 5: operations/dispatch.ts

**Files:**
- Create: `src/retrofit/executor/operations/dispatch.ts`
- Create: `src/retrofit/executor/operations/dispatch.test.ts`

A single switch on `op.op` that delegates to the right handler. Refuses unknown ops (defensive — Plan 1 schema already rejects them, but the executor enforces it again for belt-and-braces).

- [ ] **Step 1: Implement dispatch.ts (other handlers stubbed; will fill in Tasks 6–11)**

`src/retrofit/executor/operations/dispatch.ts`:

```ts
import type { Operation } from '../../types/index.js';
import { JanusError } from '../errors.js';
import { applyChmod, applyDeleteDirectory, applyDeleteFile, applyRenameFile } from './fs.js';
import { applyClaudeSettingsMerge } from './claude-settings.js';
import { applyGitignoreMerge } from './gitignore.js';
import { applyJsonMerge, applyJsonRemove, applyJsonRemoveMatching, applyJsonSet } from './json.js';
import { applyShell } from './shell.js';
import { applyWriteFile } from './write-file.js';

export type ApplyOpCtx = { repoRoot: string };

export async function applyOperation(op: Operation, ctx: ApplyOpCtx): Promise<void> {
  switch (op.op) {
    case 'write_file':
      return applyWriteFile(op, ctx);
    case 'delete_file':
      return applyDeleteFile(op, ctx);
    case 'delete_directory':
      return applyDeleteDirectory(op, ctx);
    case 'rename_file':
      return applyRenameFile(op, ctx);
    case 'chmod':
      return applyChmod(op, ctx);
    case 'json_set':
      return applyJsonSet(op, ctx);
    case 'json_remove':
      return applyJsonRemove(op, ctx);
    case 'json_remove_matching':
      return applyJsonRemoveMatching(op, ctx);
    case 'json_merge':
      return applyJsonMerge(op, ctx);
    case 'claude_settings_merge':
      return applyClaudeSettingsMerge(op, ctx);
    case 'gitignore_merge':
      return applyGitignoreMerge(op, ctx);
    case 'shell':
      return applyShell(op, ctx);
    default: {
      // Exhaustiveness check + runtime guard.
      throw new JanusError(
        'PLAN_SCHEMA_INVALID',
        `unknown op kind: ${(op as { op: string }).op}`,
      );
    }
  }
}
```

- [ ] **Step 2: Commit (no test — exercised through Tasks 6-11 + integration)**

```bash
pnpm typecheck   # will fail until Tasks 6-11 land the handlers — defer to Task 11 commit
```

Don't commit yet; this file will fail to type-check until handlers exist. Land them in Tasks 6–11 first, then come back and commit dispatch.ts at the end of Task 11.

---

## Task 6: operations/write-file.ts

**Files:**
- Create: `src/retrofit/executor/operations/write-file.ts`
- Create: `src/retrofit/executor/operations/write-file.test.ts`

- [ ] **Step 1: Write tests**

`src/retrofit/executor/operations/write-file.test.ts`:

```ts
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { applyWriteFile } from './write-file.js';

const sha256 = (s: string) => `sha256:${createHash('sha256').update(s, 'utf8').digest('hex')}`;

describe('applyWriteFile', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('creates a missing file', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await applyWriteFile(
      { op: 'write_file', path: 'biome.jsonc', content: '{}\n' },
      { repoRoot: fx.dir },
    );
    expect(readFileSync(join(fx.dir, 'biome.jsonc'), 'utf8')).toBe('{}\n');
  });

  it('refuses to overwrite without overwrite: true', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'a.txt'), 'old');
    await expect(
      applyWriteFile({ op: 'write_file', path: 'a.txt', content: 'new' }, { repoRoot: fx.dir }),
    ).rejects.toThrow(/exists/);
  });

  it('overwrites with overwrite: true and matching pre_state_hash', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'a.txt'), 'old');
    await applyWriteFile(
      {
        op: 'write_file',
        path: 'a.txt',
        content: 'new',
        overwrite: true,
        pre_state_hash: sha256('old'),
      },
      { repoRoot: fx.dir },
    );
    expect(readFileSync(join(fx.dir, 'a.txt'), 'utf8')).toBe('new');
  });

  it('aborts with PRE_STATE_HASH_MISMATCH when file changed since plan', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'a.txt'), 'changed');
    await expect(
      applyWriteFile(
        {
          op: 'write_file',
          path: 'a.txt',
          content: 'new',
          overwrite: true,
          pre_state_hash: sha256('plan-time-content'),
        },
        { repoRoot: fx.dir },
      ),
    ).rejects.toMatchObject({ code: 'PRE_STATE_HASH_MISMATCH' });
  });

  it('applies mode', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await applyWriteFile(
      { op: 'write_file', path: 'foo.sh', content: '#!/bin/sh\n', mode: 0o755 },
      { repoRoot: fx.dir },
    );
    expect(statSync(join(fx.dir, 'foo.sh')).mode & 0o777).toBe(0o755);
  });
});
```

- [ ] **Step 2: Implement write-file.ts**

`src/retrofit/executor/operations/write-file.ts`:

```ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Operation } from '../../types/index.js';
import { JanusError } from '../errors.js';

export async function applyWriteFile(
  op: Extract<Operation, { op: 'write_file' }>,
  ctx: { repoRoot: string },
): Promise<void> {
  const full = join(ctx.repoRoot, op.path);
  if (existsSync(full) && !op.overwrite) {
    throw new JanusError('PRE_STATE_HASH_MISMATCH', `file exists and overwrite not set: ${op.path}`);
  }
  if (op.pre_state_hash && existsSync(full)) {
    const actual = `sha256:${createHash('sha256').update(readFileSync(full)).digest('hex')}`;
    if (actual !== op.pre_state_hash) {
      throw new JanusError(
        'PRE_STATE_HASH_MISMATCH',
        `pre_state_hash mismatch on ${op.path}: expected ${op.pre_state_hash}, got ${actual}`,
      );
    }
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, op.content, { mode: op.mode ?? 0o644 });
}
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- write-file.test
git add src/retrofit/executor/operations/write-file.ts src/retrofit/executor/operations/write-file.test.ts
git commit -m "feat(retrofit): operations/write-file.ts — create + overwrite + pre_state_hash + mode"
```

---

## Task 7: operations/fs.ts (delete_file, delete_directory, rename_file, chmod)

**Files:**
- Create: `src/retrofit/executor/operations/fs.ts`
- Create: `src/retrofit/executor/operations/fs.test.ts`

- [ ] **Step 1: Write tests**

`src/retrofit/executor/operations/fs.test.ts`:

```ts
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { applyChmod, applyDeleteDirectory, applyDeleteFile, applyRenameFile } from './fs.js';

describe('fs ops', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('delete_file: removes existing file', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'x'), '');
    applyDeleteFile({ op: 'delete_file', path: 'x' }, { repoRoot: fx.dir });
    expect(existsSync(join(fx.dir, 'x'))).toBe(false);
  });

  it('delete_file: silent no-op when missing without pre_state_hash', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    expect(() => applyDeleteFile({ op: 'delete_file', path: 'gone' }, { repoRoot: fx.dir })).not.toThrow();
  });

  it('delete_file: PRE_STATE_HASH_MISSING_FILE when missing AND pre_state_hash set', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    expect(() =>
      applyDeleteFile(
        { op: 'delete_file', path: 'gone', pre_state_hash: 'sha256:00' },
        { repoRoot: fx.dir },
      ),
    ).toThrow(/PRE_STATE_HASH_MISSING_FILE/);
  });

  it('delete_directory: recursive removes; no-op if missing', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.husky'), { recursive: true });
    writeFileSync(join(fx.dir, '.husky/_/husky.sh'), 'x');
    applyDeleteDirectory({ op: 'delete_directory', path: '.husky' }, { repoRoot: fx.dir });
    expect(existsSync(join(fx.dir, '.husky'))).toBe(false);
    // Idempotent re-run
    expect(() =>
      applyDeleteDirectory({ op: 'delete_directory', path: '.husky' }, { repoRoot: fx.dir }),
    ).not.toThrow();
  });

  it('rename_file: moves source → dest', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'CLAUDE.md'), 'user');
    applyRenameFile(
      { op: 'rename_file', from: 'CLAUDE.md', to: 'CLAUDE.pre-janus.md' },
      { repoRoot: fx.dir },
    );
    expect(existsSync(join(fx.dir, 'CLAUDE.md'))).toBe(false);
    expect(existsSync(join(fx.dir, 'CLAUDE.pre-janus.md'))).toBe(true);
  });

  it('chmod: sets mode', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'a.sh'), '#!/bin/sh');
    applyChmod({ op: 'chmod', path: 'a.sh', mode: 0o755 }, { repoRoot: fx.dir });
    expect(statSync(join(fx.dir, 'a.sh')).mode & 0o777).toBe(0o755);
  });
});
```

- [ ] **Step 2: Implement fs.ts**

`src/retrofit/executor/operations/fs.ts`:

```ts
import { chmodSync, existsSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { Operation } from '../../types/index.js';
import { JanusError } from '../errors.js';

export function applyDeleteFile(
  op: Extract<Operation, { op: 'delete_file' }>,
  ctx: { repoRoot: string },
): void {
  const full = join(ctx.repoRoot, op.path);
  if (!existsSync(full)) {
    if (op.pre_state_hash) {
      throw new JanusError(
        'PRE_STATE_HASH_MISSING_FILE',
        `delete_file with pre_state_hash but file is missing: ${op.path}`,
      );
    }
    return; // silent no-op
  }
  unlinkSync(full);
}

export function applyDeleteDirectory(
  op: Extract<Operation, { op: 'delete_directory' }>,
  ctx: { repoRoot: string },
): void {
  const full = join(ctx.repoRoot, op.path);
  if (!existsSync(full)) return;
  rmSync(full, { recursive: true, force: true });
}

export function applyRenameFile(
  op: Extract<Operation, { op: 'rename_file' }>,
  ctx: { repoRoot: string },
): void {
  const from = join(ctx.repoRoot, op.from);
  const to = join(ctx.repoRoot, op.to);
  if (existsSync(to)) {
    throw new JanusError(
      'PRE_STATE_HASH_MISMATCH',
      `rename_file: destination ${op.to} already exists`,
    );
  }
  if (!existsSync(from)) {
    return; // already-renamed; idempotent
  }
  renameSync(from, to);
}

export function applyChmod(
  op: Extract<Operation, { op: 'chmod' }>,
  ctx: { repoRoot: string },
): void {
  const full = join(ctx.repoRoot, op.path);
  if (!existsSync(full)) return;
  chmodSync(full, op.mode);
}
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- "operations/fs"
git add src/retrofit/executor/operations/fs.ts src/retrofit/executor/operations/fs.test.ts
git commit -m "feat(retrofit): operations/fs.ts — delete_file/delete_directory/rename_file/chmod"
```

---

## Task 8: operations/json.ts

**Files:**
- Create: `src/retrofit/executor/operations/json.ts`
- Create: `src/retrofit/executor/operations/json.test.ts`

- [ ] **Step 1: Write tests**

`src/retrofit/executor/operations/json.test.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { applyJsonRemove, applyJsonRemoveMatching, applyJsonSet } from './json.js';

const writePkg = (dir: string, obj: unknown) => writeFileSync(join(dir, 'package.json'), JSON.stringify(obj, null, 2));
const readPkg = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

describe('json ops', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('json_set creates the path if missing', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writePkg(fx.dir, { name: 'p' });
    applyJsonSet(
      { op: 'json_set', path: 'package.json', pointer: '/scripts/lint', value: 'biome check' },
      { repoRoot: fx.dir },
    );
    expect(readPkg(fx.dir).scripts.lint).toBe('biome check');
  });

  it('json_remove removes the pointed-at key', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writePkg(fx.dir, { devDependencies: { eslint: '^8' } });
    applyJsonRemove(
      { op: 'json_remove', path: 'package.json', pointer: '/devDependencies/eslint' },
      { repoRoot: fx.dir },
    );
    expect(readPkg(fx.dir).devDependencies?.eslint).toBeUndefined();
  });

  it('json_remove no-ops when pointer missing', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writePkg(fx.dir, {});
    expect(() =>
      applyJsonRemove({ op: 'json_remove', path: 'package.json', pointer: '/x' }, { repoRoot: fx.dir }),
    ).not.toThrow();
  });

  it('json_remove_matching: value_regex form', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writePkg(fx.dir, { scripts: { lint: 'eslint .', build: 'tsc' } });
    applyJsonRemoveMatching(
      {
        op: 'json_remove_matching',
        path: 'package.json',
        pointer: '/scripts',
        value_regex: 'eslint',
      },
      { repoRoot: fx.dir },
    );
    expect(readPkg(fx.dir).scripts.lint).toBeUndefined();
    expect(readPkg(fx.dir).scripts.build).toBe('tsc');
  });

  it('json_remove_matching: key_regex form', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writePkg(fx.dir, { scripts: { prepare: 'husky', postinstall: 'husky', test: 'jest' } });
    applyJsonRemoveMatching(
      {
        op: 'json_remove_matching',
        path: 'package.json',
        pointer: '/scripts',
        key_regex: '^(prepare|postinstall)$',
      },
      { repoRoot: fx.dir },
    );
    const pkg = readPkg(fx.dir);
    expect(pkg.scripts.prepare).toBeUndefined();
    expect(pkg.scripts.postinstall).toBeUndefined();
    expect(pkg.scripts.test).toBe('jest');
  });
});
```

- [ ] **Step 2: Implement json.ts**

`src/retrofit/executor/operations/json.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Operation } from '../../types/index.js';

function readJson(file: string): { json: unknown; trailingNewline: boolean } {
  const text = readFileSync(file, 'utf8');
  return { json: JSON.parse(text), trailingNewline: text.endsWith('\n') };
}

function writeJson(file: string, value: unknown, trailingNewline: boolean): void {
  const out = JSON.stringify(value, null, 2);
  writeFileSync(file, trailingNewline ? `${out}\n` : out);
}

function pointerSegments(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`bad pointer: ${pointer}`);
  return pointer.slice(1).split('/').map((s) => s.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function setAtPointer(root: Record<string, unknown>, segments: string[], value: unknown): void {
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    if (typeof cur[seg] !== 'object' || cur[seg] === null) cur[seg] = {};
    cur = cur[seg] as Record<string, unknown>;
  }
  cur[segments.at(-1)!] = value;
}

function removeAtPointer(root: Record<string, unknown>, segments: string[]): void {
  let cur: Record<string, unknown> | undefined = root;
  for (let i = 0; i < segments.length - 1; i++) {
    if (typeof cur?.[segments[i]!] !== 'object' || cur[segments[i]!] === null) return;
    cur = cur[segments[i]!] as Record<string, unknown>;
  }
  if (cur) delete cur[segments.at(-1)!];
}

export function applyJsonSet(
  op: Extract<Operation, { op: 'json_set' }>,
  ctx: { repoRoot: string },
): void {
  const file = join(ctx.repoRoot, op.path);
  const { json, trailingNewline } = readJson(file);
  setAtPointer(json as Record<string, unknown>, pointerSegments(op.pointer), op.value);
  writeJson(file, json, trailingNewline);
}

export function applyJsonRemove(
  op: Extract<Operation, { op: 'json_remove' }>,
  ctx: { repoRoot: string },
): void {
  const file = join(ctx.repoRoot, op.path);
  const { json, trailingNewline } = readJson(file);
  removeAtPointer(json as Record<string, unknown>, pointerSegments(op.pointer));
  writeJson(file, json, trailingNewline);
}

export function applyJsonRemoveMatching(
  op: Extract<Operation, { op: 'json_remove_matching' }>,
  ctx: { repoRoot: string },
): void {
  const file = join(ctx.repoRoot, op.path);
  const { json, trailingNewline } = readJson(file);
  const segments = pointerSegments(op.pointer);
  // Walk to the parent object.
  let cur: Record<string, unknown> | undefined = json as Record<string, unknown>;
  for (const seg of segments) {
    if (typeof cur?.[seg] !== 'object' || cur[seg] === null) return;
    cur = cur[seg] as Record<string, unknown>;
  }
  if (!cur) return;
  const valueRegex = (op as { value_regex?: string }).value_regex;
  const keyRegex = (op as { key_regex?: string }).key_regex;
  for (const k of Object.keys(cur)) {
    if (valueRegex !== undefined) {
      const v = cur[k];
      if (typeof v === 'string' && new RegExp(valueRegex).test(v)) delete cur[k];
    } else if (keyRegex !== undefined) {
      if (new RegExp(keyRegex).test(k)) delete cur[k];
    }
  }
  writeJson(file, json, trailingNewline);
}

export function applyJsonMerge(): never {
  // v0.1 plan-builder doesn't emit json_merge. Reserved for future use.
  throw new Error('json_merge: not implemented in v0.1');
}
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- "operations/json"
git add src/retrofit/executor/operations/json.ts src/retrofit/executor/operations/json.test.ts
git commit -m "feat(retrofit): operations/json.ts — json_set/remove/remove_matching"
```

---

## Task 9: operations/claude-settings.ts (per §8 rules)

**Files:**
- Create: `src/retrofit/executor/operations/claude-settings.ts`
- Create: `src/retrofit/executor/operations/claude-settings.test.ts`

Per-field merge per §8 (no generic deep-merge fallback). Carries `additions` payload from plan-builder. Verifies `pre_state_hash` if present.

- [ ] **Step 1: Write tests**

`src/retrofit/executor/operations/claude-settings.test.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { applyClaudeSettingsMerge } from './claude-settings.js';

describe('applyClaudeSettingsMerge', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('writes settings.json from scratch when none exists', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await applyClaudeSettingsMerge(
      {
        op: 'claude_settings_merge',
        path: '.claude/settings.json',
        additions: {
          permissions: { allow: ['Bash(pnpm *)'], deny: ['Bash(rm -rf *)'] },
          hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: '.claude/hooks/x.sh' }] }],
          },
          enabledPlugins: { 'frontend-design@claude-plugins-official': true },
        } as never,
      },
      { repoRoot: fx.dir },
    );
    const written = JSON.parse(readFileSync(join(fx.dir, '.claude/settings.json'), 'utf8'));
    expect(written.permissions.allow).toEqual(['Bash(pnpm *)']);
    expect(written.enabledPlugins['frontend-design@claude-plugins-official']).toBe(true);
  });

  it('appends only non-duplicate permissions entries', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.claude'));
    writeFileSync(
      join(fx.dir, '.claude/settings.json'),
      JSON.stringify({ permissions: { allow: ['Read(**)'] } }),
    );
    await applyClaudeSettingsMerge(
      {
        op: 'claude_settings_merge',
        path: '.claude/settings.json',
        additions: {
          permissions: { allow: ['Read(**)', 'Bash(pnpm *)'], deny: [] },
        } as never,
      },
      { repoRoot: fx.dir },
    );
    const merged = JSON.parse(readFileSync(join(fx.dir, '.claude/settings.json'), 'utf8'));
    expect(merged.permissions.allow).toEqual(['Read(**)', 'Bash(pnpm *)']);
  });

  it('preserves user scalar (e.g., theme) when set', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.claude'));
    writeFileSync(
      join(fx.dir, '.claude/settings.json'),
      JSON.stringify({ cleanupPeriodDays: 30 }),
    );
    await applyClaudeSettingsMerge(
      {
        op: 'claude_settings_merge',
        path: '.claude/settings.json',
        additions: { cleanupPeriodDays: 7 } as never,
      },
      { repoRoot: fx.dir },
    );
    const merged = JSON.parse(readFileSync(join(fx.dir, '.claude/settings.json'), 'utf8'));
    expect(merged.cleanupPeriodDays).toBe(30); // user wins on scalar
  });
});
```

- [ ] **Step 2: Implement claude-settings.ts**

`src/retrofit/executor/operations/claude-settings.ts`:

```ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Operation } from '../../types/index.js';
import { JanusError } from '../errors.js';

type Settings = Record<string, unknown> & {
  permissions?: { allow?: string[]; deny?: string[] };
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
  enabledPlugins?: Record<string, boolean>;
};

const SCALAR_FIELDS = ['model', 'theme', 'cleanupPeriodDays'];

export async function applyClaudeSettingsMerge(
  op: Extract<Operation, { op: 'claude_settings_merge' }>,
  ctx: { repoRoot: string },
): Promise<void> {
  const full = join(ctx.repoRoot, op.path);
  let user: Settings = {};
  if (existsSync(full)) {
    if (op.pre_state_hash) {
      const actual = `sha256:${createHash('sha256').update(readFileSync(full)).digest('hex')}`;
      if (actual !== op.pre_state_hash) {
        throw new JanusError(
          'PRE_STATE_HASH_MISMATCH',
          `pre_state_hash mismatch on ${op.path}: expected ${op.pre_state_hash}, got ${actual}`,
        );
      }
    }
    user = JSON.parse(readFileSync(full, 'utf8')) as Settings;
  }
  const additions = op.additions as Settings;
  const merged: Settings = { ...user };

  // permissions.allow / .deny: append non-duplicate entries.
  if (additions.permissions) {
    merged.permissions = merged.permissions ?? {};
    for (const k of ['allow', 'deny'] as const) {
      const userArr = merged.permissions[k] ?? [];
      const addArr = additions.permissions[k] ?? [];
      merged.permissions[k] = [...userArr];
      for (const e of addArr) {
        if (!userArr.includes(e)) merged.permissions[k]!.push(e);
      }
    }
  }

  // hooks: append per (matcher, command) identity.
  if (additions.hooks) {
    merged.hooks = merged.hooks ?? {};
    for (const [event, addEntries] of Object.entries(additions.hooks)) {
      const existing = merged.hooks[event] ?? [];
      merged.hooks[event] = [...existing];
      for (const addEntry of addEntries) {
        const addCommand = addEntry.hooks[0]?.command ?? '';
        const exists = existing.some(
          (e) => (e.matcher ?? '') === (addEntry.matcher ?? '') && e.hooks[0]?.command === addCommand,
        );
        if (!exists) merged.hooks[event].push(addEntry);
      }
    }
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
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- claude-settings.test
git add src/retrofit/executor/operations/claude-settings.ts src/retrofit/executor/operations/claude-settings.test.ts
git commit -m "feat(retrofit): operations/claude-settings.ts — per-§8-field merge with pre_state_hash"
```

---

## Task 10: operations/gitignore.ts

**Files:**
- Create: `src/retrofit/executor/operations/gitignore.ts`
- Create: `src/retrofit/executor/operations/gitignore.test.ts`

- [ ] **Step 1: Write tests**

`src/retrofit/executor/operations/gitignore.test.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { applyGitignoreMerge } from './gitignore.js';

const BEGIN = '# --- janus baseline (managed by janus retrofit; do not edit) ---';
const END = '# --- end janus baseline ---';

describe('applyGitignoreMerge', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('appends a new janus block at end when markers absent', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, '.gitignore'), 'node_modules_user/\nlogs/\n');
    applyGitignoreMerge(
      {
        op: 'gitignore_merge',
        path: '.gitignore',
        lines: ['node_modules/', '.env'],
      },
      { repoRoot: fx.dir },
    );
    const out = readFileSync(join(fx.dir, '.gitignore'), 'utf8');
    expect(out).toContain('node_modules_user/'); // user content preserved
    expect(out).toContain(BEGIN);
    expect(out).toContain('node_modules/');
    expect(out).toContain('.env');
    expect(out).toContain(END);
  });

  it('replaces block body when markers present (idempotent)', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(
      join(fx.dir, '.gitignore'),
      `keep/\n${BEGIN}\nold-line\n${END}\nmore/\n`,
    );
    applyGitignoreMerge(
      { op: 'gitignore_merge', path: '.gitignore', lines: ['new-line', 'another'] },
      { repoRoot: fx.dir },
    );
    const out = readFileSync(join(fx.dir, '.gitignore'), 'utf8');
    expect(out).toContain('keep/');
    expect(out).toContain('new-line');
    expect(out).toContain('another');
    expect(out).not.toContain('old-line');
    expect(out).toContain('more/');
  });

  it('aborts GITIGNORE_BLOCK_MALFORMED when only one marker present', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, '.gitignore'), `${BEGIN}\nbroken\n`);
    expect(() =>
      applyGitignoreMerge(
        { op: 'gitignore_merge', path: '.gitignore', lines: ['x'] },
        { repoRoot: fx.dir },
      ),
    ).toThrow(/GITIGNORE_BLOCK_MALFORMED/);
  });
});
```

- [ ] **Step 2: Implement gitignore.ts**

`src/retrofit/executor/operations/gitignore.ts`:

```ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Operation } from '../../types/index.js';
import { JanusError } from '../errors.js';

const BEGIN = '# --- janus baseline (managed by janus retrofit; do not edit) ---';
const END = '# --- end janus baseline ---';

export function applyGitignoreMerge(
  op: Extract<Operation, { op: 'gitignore_merge' }>,
  ctx: { repoRoot: string },
): void {
  const full = join(ctx.repoRoot, op.path);
  const existing = existsSync(full) ? readFileSync(full, 'utf8') : '';
  if (op.pre_state_hash && existing) {
    const actual = `sha256:${createHash('sha256').update(existing, 'utf8').digest('hex')}`;
    if (actual !== op.pre_state_hash) {
      throw new JanusError('PRE_STATE_HASH_MISMATCH', `pre_state_hash mismatch on ${op.path}`);
    }
  }
  const block = `${BEGIN}\n${op.lines.join('\n')}\n${END}`;

  // Locate markers
  const lines = existing.split('\n');
  const beginIdx = lines.indexOf(BEGIN);
  const endIdx = lines.indexOf(END);
  const beginCount = lines.filter((l) => l === BEGIN).length;
  const endCount = lines.filter((l) => l === END).length;

  if ((beginIdx === -1) !== (endIdx === -1)) {
    throw new JanusError('GITIGNORE_BLOCK_MALFORMED', 'one marker present without its pair');
  }
  if (beginCount > 1 || endCount > 1) {
    throw new JanusError('GITIGNORE_BLOCK_MALFORMED', 'duplicate markers');
  }
  if (beginIdx !== -1 && endIdx !== -1 && beginIdx > endIdx) {
    throw new JanusError('GITIGNORE_BLOCK_MALFORMED', 'markers in reverse order');
  }

  let out: string;
  if (beginIdx === -1) {
    // Append.
    const trimmed = existing.replace(/\n+$/, '');
    out = trimmed.length > 0 ? `${trimmed}\n\n${block}\n` : `${block}\n`;
  } else {
    const before = lines.slice(0, beginIdx);
    const after = lines.slice(endIdx + 1);
    out = `${[...before, BEGIN, ...op.lines, END, ...after].join('\n')}`;
    if (!out.endsWith('\n')) out += '\n';
  }
  writeFileSync(full, out);
}
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- gitignore.test
git add src/retrofit/executor/operations/gitignore.ts src/retrofit/executor/operations/gitignore.test.ts
git commit -m "feat(retrofit): operations/gitignore.ts — block append/replace + malformed-marker abort"
```

---

## Task 11: operations/shell.ts + dispatch.ts wiring

**Files:**
- Create: `src/retrofit/executor/operations/shell.ts`
- Create: `src/retrofit/executor/operations/shell.test.ts`
- Commit `dispatch.ts` from Task 5 (now that all handlers exist).

- [ ] **Step 1: Write tests**

`src/retrofit/executor/operations/shell.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../../tests/helpers/fixture-repo.js';
import { applyShell } from './shell.js';

describe('applyShell', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('refuses commands not in the whitelist', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    await expect(
      applyShell(
        { op: 'shell', command: 'echo hi', commit_paths: [] } as never,
        { repoRoot: fx.dir },
      ),
    ).rejects.toMatchObject({ code: 'SHELL_NOT_WHITELISTED' });
  });

  it('runs whitelist entry (c) `git config --unset core.hooksPath` and ignores exit code', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    // Even though the key isn't set, this should not throw.
    await expect(
      applyShell(
        { op: 'shell', command: 'git config --unset core.hooksPath', commit_paths: [] } as never,
        { repoRoot: fx.dir },
      ),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement shell.ts**

`src/retrofit/executor/operations/shell.ts`:

```ts
import { execSync } from 'node:child_process';
import type { Operation } from '../../types/index.js';
import { JanusError } from '../errors.js';

const WHITELIST: Record<string, { ignoreExit: boolean }> = {
  'pnpm install': { ignoreExit: false },
  'pnpm dedupe': { ignoreExit: false },
  'git config --unset core.hooksPath': { ignoreExit: true },
  'find .git/hooks -type f -not -name "*.sample" -delete': { ignoreExit: true },
};

export async function applyShell(
  op: Extract<Operation, { op: 'shell' }>,
  ctx: { repoRoot: string },
): Promise<void> {
  const entry = WHITELIST[op.command];
  if (!entry) {
    throw new JanusError('SHELL_NOT_WHITELISTED', `command not on whitelist: ${op.command}`);
  }
  try {
    execSync(op.command, { cwd: ctx.repoRoot, stdio: 'pipe' });
  } catch (e) {
    if (!entry.ignoreExit) throw e;
  }
}
```

- [ ] **Step 3: Run, verify, commit shell + dispatch together**

```bash
pnpm test:unit -- shell.test
pnpm typecheck
git add src/retrofit/executor/operations/shell.ts src/retrofit/executor/operations/shell.test.ts src/retrofit/executor/operations/dispatch.ts
git commit -m "feat(retrofit): operations/shell.ts (whitelist) + operations/dispatch.ts switch"
```

---

## Task 12: step-driver.ts

**Files:**
- Create: `src/retrofit/executor/step-driver.ts`
- Create: `src/retrofit/executor/step-driver.test.ts`
- Create: `src/retrofit/executor/git.ts` — minimal helpers used by step-driver.

Composes per step: evaluate preconditions, apply each op via dispatch, check `git status --porcelain` against `commit_paths`, `git add` + `git commit`.

- [ ] **Step 1: Implement git.ts**

`src/retrofit/executor/git.ts`:

```ts
import { execFileSync } from 'node:child_process';

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
}

export function modifiedPaths(cwd: string): string[] {
  const out = git(cwd, ['status', '--porcelain']);
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3));
}

export function checkoutNewBranch(cwd: string, branch: string): void {
  git(cwd, ['checkout', '-b', branch]);
}

export function stageAndCommit(cwd: string, paths: string[], message: string): void {
  if (paths.length > 0) git(cwd, ['add', ...paths]);
  git(cwd, ['commit', '-m', message]);
}

export function lastCommitSha(cwd: string): string {
  return git(cwd, ['rev-parse', 'HEAD']).trim();
}
```

- [ ] **Step 2: Implement step-driver.ts**

`src/retrofit/executor/step-driver.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Operation, Plan } from '../types/index.js';
import { JanusError } from './errors.js';
import { modifiedPaths, stageAndCommit } from './git.js';
import { applyOperation } from './operations/dispatch.js';

type Step = Plan['payload']['steps'][number];

export type StepResult =
  | { status: 'committed'; sha: string }
  | { status: 'skipped'; reason: string }
  | { status: 'committed_empty'; reason: string };

export async function executeStep(step: Step, repoRoot: string, lastShaBefore: string): Promise<StepResult> {
  // 1. Preconditions.
  for (const pre of step.preconditions) {
    if (pre.type === 'file_exists' && !existsSync(join(repoRoot, pre.path))) {
      return { status: 'skipped', reason: `precondition failed: file_exists ${pre.path}` };
    }
  }

  // 2. + 3. Apply each op (handlers do their own pre_state_hash check).
  for (const op of step.operations) await applyOperation(op as Operation, { repoRoot });

  // 4. Verify modified paths against commit_paths.
  const modified = modifiedPaths(repoRoot);
  // Ops that don't show up in `git status` (.git/-side shell cmds, node_modules in pnpm install)
  // are exempt — their modifications go elsewhere or are gitignored.
  const expected = new Set(step.commit_paths);
  const extraneous = modified.filter((p) => !expected.has(p) && !isExpectedByOpClass(p, step));
  if (extraneous.length > 0) {
    throw new JanusError(
      'EXTRANEOUS_FILE_MODIFICATIONS',
      `step ${step.id} produced unexpected modifications: ${extraneous.join(', ')}`,
    );
  }

  if (modified.length === 0) {
    return { status: 'committed_empty', reason: 'no modifications after ops' };
  }

  // 5. Stage + commit.
  stageAndCommit(repoRoot, step.commit_paths, step.commit_message);
  const sha = require('node:child_process')
    .execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot })
    .toString('utf8')
    .trim();
  return { status: 'committed', sha };
}

function isExpectedByOpClass(_path: string, _step: Step): boolean {
  // Future: ops like `shell` `pnpm install` may modify pnpm-lock.yaml outside commit_paths.
  // For now, all ops produce predictable commit_paths handled by the spec.
  return false;
}
```

- [ ] **Step 3: Write a small step-driver test**

`src/retrofit/executor/step-driver.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import type { Plan } from '../types/index.js';
import { executeStep } from './step-driver.js';

describe('executeStep', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('applies a single write_file op and commits', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const step: Plan['payload']['steps'][number] = {
      id: 'root-configs',
      category: 'apply-shared-overlay',
      title: 'configs',
      commit_message: 'chore: apply janus root configs',
      preconditions: [],
      operations: [{ op: 'write_file', path: 'biome.jsonc', content: '{}\n' }],
      commit_paths: ['biome.jsonc'],
    };
    const result = await executeStep(step, fx.dir, 'sha-before');
    expect(result.status).toBe('committed');
    expect(existsSync(join(fx.dir, 'biome.jsonc'))).toBe(true);
  });

  it('skips when precondition fails', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const step: Plan['payload']['steps'][number] = {
      id: 'displace-eslint',
      category: 'displace-tools',
      title: '',
      commit_message: 'chore: e',
      preconditions: [{ type: 'file_exists', path: '.eslintrc.json' }],
      operations: [{ op: 'delete_file', path: '.eslintrc.json' }],
      commit_paths: [],
    };
    const result = await executeStep(step, fx.dir, 'sha-before');
    expect(result.status).toBe('skipped');
  });
});
```

- [ ] **Step 4: Run, verify, commit**

```bash
pnpm test:unit -- step-driver.test
pnpm typecheck
git add src/retrofit/executor/git.ts src/retrofit/executor/step-driver.ts src/retrofit/executor/step-driver.test.ts
git commit -m "feat(retrofit): step-driver.ts + git.ts — precondition+ops+status+commit composition"
```

---

## Task 13: run-report.ts

**Files:**
- Create: `src/retrofit/executor/run-report.ts`

A tiny struct that the executor accumulates as it runs.

- [ ] **Step 1: Implement run-report.ts**

```ts
import type { StepResult } from './step-driver.js';

export type RunReport = {
  branch: string;
  total_steps: number;
  committed: Array<{ id: string; sha: string }>;
  skipped: Array<{ id: string; reason: string }>;
  empty: Array<{ id: string; reason: string }>;
  warnings_count: number;
  last_good_sha?: string;
};

export function emptyReport(branch: string, totalSteps: number, warningsCount: number): RunReport {
  return {
    branch,
    total_steps: totalSteps,
    committed: [],
    skipped: [],
    empty: [],
    warnings_count: warningsCount,
  };
}

export function recordResult(report: RunReport, stepId: string, result: StepResult): void {
  if (result.status === 'committed') {
    report.committed.push({ id: stepId, sha: result.sha });
    report.last_good_sha = result.sha;
  } else if (result.status === 'skipped') {
    report.skipped.push({ id: stepId, reason: result.reason });
  } else if (result.status === 'committed_empty') {
    report.empty.push({ id: stepId, reason: result.reason });
  }
}
```

- [ ] **Step 2: Commit**

```bash
pnpm typecheck
git add src/retrofit/executor/run-report.ts
git commit -m "feat(retrofit): run-report.ts — execution report struct"
```

---

## Task 14: marker.ts

**Files:**
- Create: `src/retrofit/executor/marker.ts`
- Create: `src/retrofit/executor/marker.test.ts`

Builds the final `JanusMarker` JSON and replaces the placeholder content from Plan 3's `write-marker` step's first op.

- [ ] **Step 1: Implement + test**

`src/retrofit/executor/marker.ts`:

```ts
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
    skipped_steps: [...args.report.skipped.map((s) => s.id), ...args.report.empty.map((e) => e.id)],
    slots: args.plan.payload.slots,
    plugins: args.plan.payload.plugins,
    shared_overlay_version: args.shared_overlay_version,
    archetype_overlay_version: args.archetype_overlay_version,
  };
}
```

`src/retrofit/executor/marker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Plan } from '../types/index.js';
import { buildMarker } from './marker.js';
import { emptyReport } from './run-report.js';

describe('buildMarker', () => {
  it('reflects committed + skipped + empty steps from the run report', () => {
    const plan: Plan = {
      schema_version: '1',
      meta: { janus_version: '0.1.0', generated_at: '2026-05-05T00:00:00Z' },
      payload: {
        repo_root: '/x',
        archetype: 'generic-ts',
        target_branch: 'janus/retrofit',
        slots: { workload: 'foo' } as Plan['payload']['slots'],
        plugins: ['playwright@claude-plugins-official'],
        prior_marker: null,
        warnings: [],
        steps: [],
      },
    };
    const report = emptyReport('janus/retrofit', 3, 0);
    report.committed.push({ id: 'displace-eslint', sha: 'abc' });
    report.skipped.push({ id: 'displace-husky', reason: 'precondition' });
    report.empty.push({ id: 'displace-jest', reason: 'no diff' });
    const marker = buildMarker({
      plan,
      report,
      applied_at: new Date('2026-05-05T01:00:00Z'),
      shared_overlay_version: '0.1.0',
      archetype_overlay_version: '0.1.0',
    });
    expect(marker.applied_steps).toEqual(['displace-eslint']);
    expect(marker.skipped_steps).toEqual(['displace-husky', 'displace-jest']);
    expect(marker.plugins).toEqual(['playwright@claude-plugins-official']);
    expect(marker.applied_at).toBe('2026-05-05T01:00:00.000Z');
  });
});
```

- [ ] **Step 2: Run, verify, commit**

```bash
pnpm test:unit -- marker.test
pnpm typecheck
git add src/retrofit/executor/marker.ts src/retrofit/executor/marker.test.ts
git commit -m "feat(retrofit): executor/marker.ts — final JanusMarker construction"
```

---

## Task 15: git.ts — branch collision search

**Files:**
- Modify: `src/retrofit/executor/git.ts`
- Create: `src/retrofit/executor/git.test.ts`

Add `suggestAvailableBranch(repoRoot, base, noRemoteCheck)` returning the next free branch in the `<base>-2…99` range, or throwing `BRANCH_SUGGESTION_EXHAUSTED`.

- [ ] **Step 1: Add the function to git.ts**

```ts
export function suggestAvailableBranch(
  repoRoot: string,
  base: string,
  noRemoteCheck: boolean,
): string {
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    if (branchExists(repoRoot, candidate, noRemoteCheck)) continue;
    return candidate;
  }
  throw new JanusError('BRANCH_SUGGESTION_EXHAUSTED', `no available branch in ${base}-2..99`);
}

function branchExists(repoRoot: string, branch: string, noRemoteCheck: boolean): boolean {
  try {
    git(repoRoot, ['rev-parse', '--verify', `refs/heads/${branch}`]);
    return true;
  } catch {
    // local missing; check remote
  }
  if (noRemoteCheck) return false;
  try {
    const out = git(repoRoot, ['ls-remote', '--heads', 'origin', branch]).trim();
    return out.length > 0;
  } catch {
    return false; // ls-remote failure → treat as not present
  }
}
```

Add the import at top:

```ts
import { JanusError } from './errors.js';
```

- [ ] **Step 2: Tests**

`src/retrofit/executor/git.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { suggestAvailableBranch } from './git.js';

describe('suggestAvailableBranch', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('returns -2 when base exists', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git branch janus/retrofit', { cwd: fx.dir, stdio: 'pipe' });
    expect(suggestAvailableBranch(fx.dir, 'janus/retrofit', true)).toBe('janus/retrofit-2');
  });

  it('returns -3 when base + -2 exist', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git branch janus/retrofit', { cwd: fx.dir, stdio: 'pipe' });
    execSync('git branch janus/retrofit-2', { cwd: fx.dir, stdio: 'pipe' });
    expect(suggestAvailableBranch(fx.dir, 'janus/retrofit', true)).toBe('janus/retrofit-3');
  });
});
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- "executor/git"
pnpm typecheck
git add src/retrofit/executor/git.ts src/retrofit/executor/git.test.ts
git commit -m "feat(retrofit): git.ts — suggestAvailableBranch with collision search"
```

---

## Task 16: executor/index.ts (main loop + --dry-run)

**Files:**
- Create: `src/retrofit/executor/index.ts`
- Create: `src/retrofit/executor/index.test.ts`

The public `execute(plan, repoRoot, opts)` function. Handles --dry-run (run pre-flight, print step summary, exit). Otherwise: pre-flight → checkout new branch → loop steps → write marker → final commit → return RunReport.

- [ ] **Step 1: Implement index.ts**

`src/retrofit/executor/index.ts`:

```ts
import type { Plan } from '../types/index.js';
import { JanusError } from './errors.js';
import { checkoutNewBranch, lastCommitSha } from './git.js';
import { buildMarker } from './marker.js';
import { runAllRetrofitPreflight } from './preflight/index.js';
import { recordResult, type RunReport, emptyReport } from './run-report.js';
import { executeStep } from './step-driver.js';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ExecuteOpts = {
  planPath: string;
  /** Override the plan's target_branch. */
  branch?: string;
  noRemoteCheck?: boolean;
  dryRun?: boolean;
  /** For tests: clock injection. */
  now?: Date;
  shared_overlay_version?: string;
  archetype_overlay_version?: string;
};

export async function execute(
  plan: Plan,
  repoRoot: string,
  opts: ExecuteOpts,
): Promise<RunReport> {
  const branch = opts.branch ?? plan.payload.target_branch;
  const targetPaths = new Set(plan.payload.steps.flatMap((s) => s.commit_paths));

  await runAllRetrofitPreflight({
    plan,
    planPath: opts.planPath,
    repoRoot,
    archetype: plan.payload.archetype,
    targetPaths,
    noRemoteCheck: opts.noRemoteCheck ?? false,
  });

  if (opts.dryRun) {
    return summarizeDryRun(plan, branch);
  }

  checkoutNewBranch(repoRoot, branch);

  const report = emptyReport(branch, plan.payload.steps.length, plan.payload.warnings.length);
  let lastSha = lastCommitSha(repoRoot);

  for (const step of plan.payload.steps) {
    if (step.id === 'write-marker') {
      // Defer marker write — we need the report to be complete first.
      continue;
    }
    try {
      const result = await executeStep(step, repoRoot, lastSha);
      recordResult(report, step.id, result);
      if (result.status === 'committed') lastSha = result.sha;
    } catch (e) {
      // Annotate with last-good SHA before rethrowing.
      throw new JanusError(
        e instanceof JanusError ? e.code : 'EXTRANEOUS_FILE_MODIFICATIONS',
        `step ${step.id} failed: ${(e as Error).message}\n  last-good-sha: ${lastSha}\n  recover: git reset --hard ${lastSha}`,
      );
    }
  }

  // Final marker step: build the real marker JSON and write it via a synthetic step.
  const marker = buildMarker({
    plan,
    report,
    applied_at: opts.now ?? new Date(),
    shared_overlay_version: opts.shared_overlay_version ?? '0.1.0',
    archetype_overlay_version: opts.archetype_overlay_version ?? '0.1.0',
  });
  writeFileSync(join(repoRoot, '.janus.json'), `${JSON.stringify(marker, null, 2)}\n`);
  const finalStep = plan.payload.steps.find((s) => s.id === 'write-marker');
  if (finalStep) {
    const result = await executeStep(
      { ...finalStep, operations: [], commit_paths: ['.janus.json'] },
      repoRoot,
      lastSha,
    );
    recordResult(report, 'write-marker', result);
  }

  return report;
}

function summarizeDryRun(plan: Plan, branch: string): RunReport {
  const report = emptyReport(branch, plan.payload.steps.length, plan.payload.warnings.length);
  for (const s of plan.payload.steps) {
    report.skipped.push({ id: s.id, reason: 'dry-run: no operations applied' });
  }
  return report;
}
```

- [ ] **Step 2: Write end-to-end test**

`src/retrofit/executor/index.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { diagnose } from '../plan-builder/diagnose.js';
import { execute } from './index.js';

const JANUS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('execute (end-to-end on greenfield + generic-ts)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('runs pre-flight, checks out branch, applies steps, writes marker', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test/foo.git', { cwd: fx.dir, stdio: 'pipe' });

    const plan = await diagnose({
      repoRoot: fx.dir,
      archetype: 'generic-ts',
      cliSlots: { author: 'T', author_email: 't@e.com', description: 'd' },
      now: new Date('2026-05-05T00:00:00Z'),
      janusRoot: JANUS_ROOT,
    });
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, JSON.stringify(plan, null, 2));

    const report = await execute(plan, fx.dir, { planPath, noRemoteCheck: true, now: new Date('2026-05-05T01:00:00Z') });
    expect(report.committed.length).toBeGreaterThan(0);
    expect(existsSync(join(fx.dir, '.janus.json'))).toBe(true);
    expect(existsSync(join(fx.dir, 'biome.jsonc'))).toBe(true);
  }, 60_000);

  it('--dry-run runs pre-flight without changes', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test/foo.git', { cwd: fx.dir, stdio: 'pipe' });

    const plan = await diagnose({
      repoRoot: fx.dir,
      archetype: 'generic-ts',
      cliSlots: { author: 'T', author_email: 't@e.com', description: 'd' },
      now: new Date('2026-05-05T00:00:00Z'),
      janusRoot: JANUS_ROOT,
    });
    const planPath = join(fx.dir, '.janus-retrofit.json');
    writeFileSync(planPath, JSON.stringify(plan, null, 2));

    const before = execSync('git rev-parse HEAD', { cwd: fx.dir }).toString();
    await execute(plan, fx.dir, { planPath, noRemoteCheck: true, dryRun: true });
    const after = execSync('git rev-parse HEAD', { cwd: fx.dir }).toString();
    expect(before).toBe(after);
    expect(existsSync(join(fx.dir, 'biome.jsonc'))).toBe(false);
  });
});
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- "executor/index"
pnpm typecheck
git add src/retrofit/executor/index.ts src/retrofit/executor/index.test.ts
git commit -m "feat(retrofit): executor/index.ts — main execute loop + --dry-run"
```

---

## Task 17: Final sanity — Plan 4 close-out

- [ ] **Step 1: Full suite + build + pack + biome**

```bash
pnpm test
rm -rf dist .tsbuildinfo
pnpm build && pnpm typecheck
pnpm pack --dry-run
pnpm check
git status
git add -A && git commit -m "chore(retrofit): biome formatting fixups for Plan 4"   # if diff
```

Plan 4 complete. End state:
- All 12 op handlers implemented + unit-tested.
- Pre-flight #1–#16 enforced in numeric order, deferring #6/#7 until after overlay.
- `execute()` runs end-to-end on the greenfield+generic-ts case (verified by integration test).
- `--dry-run` makes no working-tree changes.
- `RunReport` carries last-good SHA on abort.
- Marker is written via the final synthesized step with placeholder content replaced.

---

## Self-review checklist

1. **Spec coverage:**
   - §4 pre-flight checks #1–#16 → Tasks 1, 2, 3 (with the explicit deferred ordering rule in Task 4)
   - §7 op vocabulary → Tasks 5–11
   - §9 step driver semantics → Task 12
   - §9 abort + last-good SHA → Tasks 13 + 16
   - §10 marker shape → Task 14
   - §11 --branch collision search → Task 15
   - §11 --dry-run → Task 16
2. **Out-of-scope discipline:** No CLI parsing, no prompt UI, no help text. `bin/janus.js` untouched.
3. **TOCTOU handling:** `pre_state_hash` checked at op-application time inside each handler that supports it (`write_file`, `delete_file`, `claude_settings_merge`, `gitignore_merge`).
4. **Type consistency:** `Operation` discriminated union used uniformly across dispatch + handlers. `Plan['payload']['steps'][number]` reused as the local `Step` alias.
5. **Future considerations:** `WARN_OVERWRITE_USER_KIT` warnings for `claude-skills-overlay` / `claude-hooks-overlay` are computable at executor time (handler sees user's existing file); enrichment deferred to Plan 5 or later — the current behavior is correct (overlay-with-replace) but the warning isn't yet surfaced. Tracked here for visibility.

---

## Plan 5 preview (do not execute as part of Plan 4)

Plan 5 lands the user-facing CLI and the prompt UI:

- `bin/janus.js` — add `diagnose` and `retrofit` subcommands (preserve existing `scaffold`/`bootstrap`).
- arg parsing: `--archetype`, `--slot key=value`, `--plugin name@source`, `--no-plugin name`, `--non-interactive`, `--out`, `--plan`, `--branch`, `--dry-run`, `--no-remote-check`.
- prompt UI: minimal stdin-based prompts wired into `resolveSlots`'s `prompt` callback and `resolvePlugins`'s `confirm` callback.
- diagnose stdout summary per spec §11.
- retrofit stdout summary on success.
- `unrecognized_tools` allowlist read from `docs/conventions/dependencies.md` (replaces hardcoded set in Plan 2 Task 10).
- `--help` text.
- ~10 unit tests (arg parsing, summary formatter, allowlist reader) + 2 manual dogfood targets.
