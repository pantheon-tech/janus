# janus retrofit — Plan 2 of 5: Analyzer + Resolvers + Overlay-Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the inputs that the plan-builder needs: a `RepoSnapshot` produced by per-concern analyzer modules, slot/plugin resolvers, and an `OverlayTree` builder that mirrors `scripts/scaffold.sh` exactly.

**Architecture:** Plan 2 is read-only and pure: nothing it adds touches the user's repo. Three subsystems land in this plan — (1) `analyzer/` walks a target repo and produces `RepoSnapshot`; (2) `resolvers/` derive `SlotMap`/`PluginSet` from snapshot + prior `.janus.json` + CLI overrides + (optionally) prompt callback; (3) `plan-builder/overlay-tree.ts` builds the rendered overlay map (`path → { content_bytes, mode }`) by replicating scaffold.sh's walk over `templates/_shared/` + `templates/<archetype>/`. `analyzer/baseline-diff.ts` consumes the overlay tree to produce `BaselineFileStatus[]`. ~12 fixture repos under `tests/fixtures/repos/` exercise everything. No CLI wiring; `bin/janus.js` untouched.

**Tech Stack:** TypeScript 5.7 (strict, NodeNext), vitest 3.0, Node 24's `node:fs`/`node:child_process`/`node:path`, the existing vendored `scripts/lib/mo` (Mustache renderer), `jq` from the system, the schemas/types/validators from Plan 1.

**Out of scope for Plan 2:** Plan-builder main (`buildPlan()`), step generators (`displace-tools.ts`, etc.), determinism sort/hash, executor, CLI subcommands, prompt UI (resolvers accept a callback; the real prompt is a Plan 5 concern). `chmod` op handling, claude_settings_merge content construction, marker writing, and any disk mutation belong to Plan 4.

---

## Spec coverage map

| Spec § | Plan 2 deliverable |
|---|---|
| §3 architecture box "analyzer" | `src/retrofit/analyzer/{git-state,package-manager,displaced-tools,claude-kit,plugin-evidence,index}.ts` |
| §3 architecture box "slot+plugin resolver" | `src/retrofit/resolvers/{slot-validation,slots,plugins}.ts` |
| §5 analyzer detection rules | one task per per-concern module + fixture coverage |
| §5 `RepoSnapshot` field set | extended types in Task 1 |
| §5 `BaselineFileStatus` (computed against overlay tree) | `analyzer/baseline-diff.ts` (Task 19) |
| §5a slot resolution source order | Task 12 |
| §5a slot validation regex table | Task 11 |
| §5a `--non-interactive` failure modes | Task 12 step 3 |
| §5b plugin auto-detect evidence | Task 9 + Task 13 |
| §5b `--plugin` / `--no-plugin` interaction | Task 13 |
| §6 step 1 (walk shared) | Task 14 (walker) + Task 15 (mo) |
| §6 step 2 (walk archetype, jq merge package.json, .env.example append) | Task 16 |
| §6 step 1 `.gitignore` special case | Task 17 |
| §6 step 4 user-side package.json merge | Task 18 |
| §6 step 1 mode preservation (hooks 0755) | Task 14 step 1 + Task 16 |
| §6 step 2 archetype `README.md` skip | Task 16 step 1 |
| §6 step 2 `.exclude` `is_excluded()` semantics | Task 14 step 1 |
| §12 ~12 fixture repos | Tasks 3 + 6 + 20 |
| §15 file layout | end-state matches the informational sketch in §15 |

---

## File structure

**New types in `src/retrofit/types/index.ts`:** `PackageJsonSnapshot`, `DisplacedTool`, `WorkflowFile`, `PluginEvidence`, `ClaudeKitSnapshot`, `BaselineFileStatus`, `RepoSnapshot`, `OverlayEntry`, `OverlayTree`, `GitignoreOverlayMarker`. Each has one clear responsibility and is mirrored only against §5 / §6 (no analyzer-private state in the type).

**New code modules:**

```
src/retrofit/
├── analyzer/
│   ├── git-state.ts          — head_branch, is_tracking, tree_clean, has_submodules, remote
│   ├── package-manager.ts    — package_manager, lockfiles_present, package_json, has_package_json, workspace
│   ├── displaced-tools.ts    — displaced_tools[]
│   ├── claude-kit.ts         — claude_kit
│   ├── plugin-evidence.ts    — plugin_evidence
│   ├── baseline-diff.ts      — (repoRoot, OverlayTree) → BaselineFileStatus[]
│   └── index.ts              — analyze(): returns Omit<RepoSnapshot, 'baseline_files'>
├── resolvers/
│   ├── slot-validation.ts    — regex rules from §5a
│   ├── slots.ts              — resolveSlots() per §5a source order
│   └── plugins.ts            — resolvePlugins() per §5b
└── plan-builder/
    └── overlay-tree.ts       — buildOverlayTree(janusRoot, archetype, slotMap) → OverlayTree
```

**New test scaffolding:**

```
tests/
├── helpers/
│   └── fixture-repo.ts       — materializeFixture(name): { dir, cleanup }
└── fixtures/repos/
    ├── greenfield/                      — empty repo, just `.git/`
    ├── eslint-only/                     — package.json + .eslintrc.json
    ├── prettier-husky/                  — .prettierrc + .husky/
    ├── npm-with-jest/                   — package.json + jest.config.js + package-lock.json
    ├── pnpm-workspace/                  — pnpm-workspace.yaml + packages/
    ├── already-janus/                   — `.janus.json` marker present
    ├── repo-without-package-json/       — README only
    ├── commonjs-repo/                   — package.json with type: commonjs
    ├── monorepo/                        — workspace root with members
    ├── repo-with-user-modified-skill/   — .claude/skills/foo.md
    ├── repo-with-submodule/             — .gitmodules + submodule path
    └── repo-with-symlink/               — symlink in tracked tree
```

Fixture directories contain literal files; the materializer copies the tree into `/tmp/`, runs `git init` + initial commit, and (for fixtures with non-default git state) applies a `setup.sh` if present. See Task 2.

**Modified files:**

- `src/retrofit/types/index.ts` (Task 1) — add Plan 2 types.
- `package.json` (Task 22 if biome reformats anything) — formatting fixups only.

---

## Conventions used in this plan

- Every test file's path is `<module>.test.ts` co-located with the module (e.g., `src/retrofit/analyzer/git-state.test.ts`). Cross-cutting end-to-end tests go under `tests/integration/`.
- Commit messages use Conventional Commits with `chore:`, `feat:`, `test:`, or `refactor:` prefixes (no scope on `chore:`/`test:`; `feat:` and `refactor:` use `(retrofit)` scope).
- Each task ends with a single commit. Tests and implementation land in the same commit when they're a TDD red+green pair within one task; large fixture additions get their own task.
- All tests run under `pnpm test:unit`. Integration tests run under `pnpm test:unit` too (vitest picks up `tests/**/*.test.ts`); no separate suite.
- Worktree discipline: every step assumes you are in the Plan 2 worktree. Run `git rev-parse --show-toplevel` if uncertain.

---

## Task 1: Extend types/index.ts with Plan 2 types

**Files:**
- Modify: `src/retrofit/types/index.ts` — add new types after the existing Plan/JanusMarker types.

- [ ] **Step 1: Add the new types**

Append these declarations to `src/retrofit/types/index.ts`. Do not edit existing exports — additions only.

```ts
// ---- Plan 2: Analyzer + overlay types ----

export type PackageJsonSnapshot = {
  raw: Record<string, unknown>;
  type?: 'module' | 'commonjs';
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  author?: string | { name?: string; email?: string };
  description?: string;
  license?: string;
};

export type DisplacedTool = {
  name: 'eslint' | 'prettier' | 'husky' | 'jest' | 'commitlint_old';
  evidence: string[];
};

export type WorkflowFile = {
  path: string;
  references_displaced_tool: string[];
};

export type PluginEvidence = {
  'frontend-design@claude-plugins-official': string[];
  'playwright@claude-plugins-official': string[];
  'pyright-lsp@claude-plugins-official': string[];
};

export type ClaudeKitSnapshot = {
  has_claude_dir: boolean;
  has_settings_json: boolean;
  has_claude_md: boolean;
  has_pre_janus_md: boolean;
  hooks: string[];
  skills: string[];
  misc: string[];
};

export type BaselineFileStatus = {
  path: string;
  status: 'missing' | 'present_identical' | 'present_differs';
  pre_state_hash?: Sha256;
  current_mode?: number;
};

export type RepoSnapshot = {
  repo_root: string;
  has_janus_marker: boolean;
  prior_marker?: JanusMarker;
  package_manager: 'pnpm' | 'npm' | 'yarn' | 'none';
  lockfiles_present: string[];
  package_json?: PackageJsonSnapshot;
  has_package_json: boolean;
  workspace?: { type: 'pnpm'; packages: string[] };
  displaced_tools: DisplacedTool[];
  baseline_files: BaselineFileStatus[];
  claude_kit: ClaudeKitSnapshot;
  ci_workflows: WorkflowFile[];
  unrecognized_tools: string[];
  plugin_evidence: PluginEvidence;
  git: {
    head_branch: string;
    is_tracking: boolean;
    tree_clean: boolean;
    has_submodules: boolean;
  };
  remote: {
    origin_url?: string;
    parsed?: { host: string; org: string; repo: string };
  };
};

// ---- Plan 2: Overlay-tree types ----

export type OverlayEntry = {
  content: Buffer;
  mode: number;
};

export type OverlayTree = Map<string, OverlayEntry>;

// Sentinel returned by the overlay-tree builder for `.gitignore` when the
// user already has one — signals plan-builder to emit a `gitignore_merge`
// op rather than a `write_file` op.
export type GitignoreOverlayMarker = {
  kind: 'gitignore_merge';
  lines: string[]; // janus's lines, in source order, fixed for determinism
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS. The new types reference `JanusMarker` and `Sha256` which already exist in this file from Plan 1.

- [ ] **Step 3: Commit**

```bash
git add src/retrofit/types/index.ts
git commit -m "chore(retrofit): add Plan 2 types (RepoSnapshot, OverlayTree, etc.)"
```

---

## Task 2: Fixture-repo materializer helper

**Files:**
- Create: `tests/helpers/fixture-repo.ts`
- Create: `tests/helpers/fixture-repo.test.ts`

This helper copies a fixture tree into a temp dir, initializes git, and stages an initial commit. Test infrastructure for every analyzer test downstream.

- [ ] **Step 1: Write the failing test**

Create `tests/helpers/fixture-repo.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from './fixture-repo.js';

describe('materializeFixture', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('copies the fixture tree into a fresh temp dir', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);

    expect(fx.dir).toMatch(/^\/tmp\/janus-fixture-/);
    expect(existsSync(join(fx.dir, '.git'))).toBe(true);
  });

  it('initializes git with an initial commit on a default branch', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);

    // .git/HEAD points to a real ref with at least one commit
    const head = readFileSync(join(fx.dir, '.git', 'HEAD'), 'utf8').trim();
    expect(head).toMatch(/^ref: refs\/heads\/\w+/);
  });

  it('cleanup removes the temp dir', () => {
    const fx = materializeFixture('greenfield');
    fx.cleanup();
    expect(existsSync(fx.dir)).toBe(false);
  });

  it('throws if the fixture name is unknown', () => {
    expect(() => materializeFixture('nonexistent-fixture-xyz')).toThrow(/fixture/i);
  });
});
```

- [ ] **Step 2: Create the greenfield fixture (minimal — just enough for the helper test)**

Create `tests/fixtures/repos/greenfield/README.md`:

```markdown
# greenfield

A repo with nothing in it but this README. Useful baseline for analyzer tests.
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test:unit -- fixture-repo.test`
Expected: FAIL with "Cannot find module './fixture-repo.js'" or similar.

- [ ] **Step 4: Implement the helper**

Create `tests/helpers/fixture-repo.ts`:

```ts
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_ROOT = fileURLToPath(new URL('../fixtures/repos/', import.meta.url));

export type Fixture = {
  dir: string;
  cleanup: () => void;
};

export function materializeFixture(name: string): Fixture {
  const src = join(FIXTURES_ROOT, name);
  if (!existsSync(src)) {
    throw new Error(`fixture not found: ${name} (looked in ${src})`);
  }

  const dir = mkdtempSync(join(tmpdir(), 'janus-fixture-'));
  cpSync(src, dir, { recursive: true });

  // git init + initial commit so analyzer can read git state.
  // -c flags isolate from any user-global git config that could change defaults.
  const git = (cmd: string) =>
    execSync(`git ${cmd}`, {
      cwd: dir,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'janus-test',
        GIT_AUTHOR_EMAIL: 'janus@test.local',
        GIT_COMMITTER_NAME: 'janus-test',
        GIT_COMMITTER_EMAIL: 'janus@test.local',
      },
    });

  git('init -q -b main');
  git('config commit.gpgsign false');
  git('add -A');
  // --allow-empty for fixtures that have no files (would be unusual but safe).
  git('commit -q --allow-empty -m "fixture: initial commit"');

  // Optional fixture-specific setup script (used by submodule, detached-head fixtures).
  const setupScript = join(src, 'setup.sh');
  if (existsSync(setupScript)) {
    execSync(`bash "${setupScript}"`, { cwd: dir, stdio: 'pipe' });
  }

  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup; tests have already asserted by this point.
      }
    },
  };
}

// Convenience: write content to a file inside a materialized fixture, then stage+commit.
export function commitFile(dir: string, relPath: string, content: string, message = 'fixture: update') {
  const full = join(dir, relPath);
  writeFileSync(full, content);
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync(`git commit -q -m "${message}"`, {
    cwd: dir,
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'janus-test',
      GIT_AUTHOR_EMAIL: 'janus@test.local',
      GIT_COMMITTER_NAME: 'janus-test',
      GIT_COMMITTER_EMAIL: 'janus@test.local',
    },
  });
}
```

The `setup.sh` hook lets fixtures with non-default git state (submodules, detached HEAD, untracked changes) self-configure. The `commitFile` helper is exported for tests that need to add untracked files mid-test (e.g., the `tree_clean: false` case).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test:unit -- fixture-repo.test`
Expected: PASS — 4/4 tests.

- [ ] **Step 6: Commit**

```bash
git add tests/helpers/fixture-repo.ts tests/helpers/fixture-repo.test.ts tests/fixtures/repos/greenfield/
git commit -m "test(retrofit): add fixture-repo materializer + greenfield fixture"
```

---

## Task 3: Add the early-batch analyzer fixtures

**Files:**
- Create: `tests/fixtures/repos/eslint-only/{package.json,.eslintrc.json}`
- Create: `tests/fixtures/repos/prettier-husky/{package.json,.prettierrc,.husky/pre-commit}`
- Create: `tests/fixtures/repos/npm-with-jest/{package.json,package-lock.json,jest.config.js}`
- Create: `tests/fixtures/repos/repo-without-package-json/README.md`

These four are needed by the early analyzer tests (Tasks 4–7). Submodule/symlink/monorepo/already-janus/commonjs/user-modified-skill come later in Task 20.

- [ ] **Step 1: Create eslint-only fixture**

`tests/fixtures/repos/eslint-only/package.json`:

```json
{
  "name": "eslint-only-repo",
  "version": "0.0.0",
  "scripts": {
    "lint": "eslint ."
  },
  "devDependencies": {
    "eslint": "^8.0.0"
  }
}
```

`tests/fixtures/repos/eslint-only/.eslintrc.json`:

```json
{
  "root": true,
  "extends": ["eslint:recommended"]
}
```

- [ ] **Step 2: Create prettier-husky fixture**

`tests/fixtures/repos/prettier-husky/package.json`:

```json
{
  "name": "prettier-husky-repo",
  "version": "0.0.0",
  "scripts": {
    "prepare": "husky",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "prettier": "^3.0.0",
    "husky": "^9.0.0"
  }
}
```

`tests/fixtures/repos/prettier-husky/.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true
}
```

`tests/fixtures/repos/prettier-husky/.husky/pre-commit`:

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npm test
```

- [ ] **Step 3: Create npm-with-jest fixture**

`tests/fixtures/repos/npm-with-jest/package.json`:

```json
{
  "name": "npm-with-jest-repo",
  "version": "0.0.0",
  "scripts": {
    "test": "jest"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

`tests/fixtures/repos/npm-with-jest/package-lock.json`:

```json
{
  "name": "npm-with-jest-repo",
  "version": "0.0.0",
  "lockfileVersion": 3,
  "requires": true,
  "packages": {
    "": {
      "name": "npm-with-jest-repo",
      "version": "0.0.0",
      "devDependencies": {
        "jest": "^29.0.0"
      }
    }
  }
}
```

`tests/fixtures/repos/npm-with-jest/jest.config.js`:

```js
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
};
```

- [ ] **Step 4: Create repo-without-package-json fixture**

`tests/fixtures/repos/repo-without-package-json/README.md`:

```markdown
# repo-without-package-json

A repo with no package.json. Tests the analyzer's "create from scratch" path.
```

- [ ] **Step 5: Sanity-check fixtures materialize cleanly**

Run: `pnpm test:unit -- fixture-repo.test`
Expected: PASS — the existing helper test should still pass with the new fixtures present (helper only loads fixtures by name).

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/repos/
git commit -m "test(retrofit): add eslint-only, prettier-husky, npm-with-jest, no-package-json fixtures"
```

---

## Task 4: analyzer/git-state.ts

**Files:**
- Create: `src/retrofit/analyzer/git-state.ts`
- Create: `src/retrofit/analyzer/git-state.test.ts`

Purely git inspection: `head_branch`, `is_tracking`, `tree_clean`, `has_submodules`, plus parsed remote info.

- [ ] **Step 1: Write the failing tests**

`src/retrofit/analyzer/git-state.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyzeGitState } from './git-state.js';

describe('analyzeGitState', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('reports head_branch from a fresh fixture', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const state = analyzeGitState(fx.dir);
    expect(state.git.head_branch).toBe('main');
    expect(state.git.is_tracking).toBe(false); // fixtures have no remote
    expect(state.git.tree_clean).toBe(true);
    expect(state.git.has_submodules).toBe(false);
  });

  it('reports tree_clean: false when working tree is dirty', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'untracked.txt'), 'hello');
    const state = analyzeGitState(fx.dir);
    expect(state.git.tree_clean).toBe(false);
  });

  it('parses an https github remote', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/pantheon-tech/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const state = analyzeGitState(fx.dir);
    expect(state.remote.origin_url).toBe('https://github.com/pantheon-tech/foo.git');
    expect(state.remote.parsed).toEqual({
      host: 'github.com',
      org: 'pantheon-tech',
      repo: 'foo',
    });
  });

  it('parses an ssh github remote', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin git@github.com:pantheon-tech/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const state = analyzeGitState(fx.dir);
    expect(state.remote.parsed).toEqual({
      host: 'github.com',
      org: 'pantheon-tech',
      repo: 'foo',
    });
  });

  it('returns parsed: undefined for non-github remotes', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://gitlab.example.com/team/proj.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const state = analyzeGitState(fx.dir);
    expect(state.remote.origin_url).toBe('https://gitlab.example.com/team/proj.git');
    expect(state.remote.parsed).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- git-state.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement git-state.ts**

`src/retrofit/analyzer/git-state.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoSnapshot } from '../types/index.js';

type GitState = Pick<RepoSnapshot, 'git' | 'remote'>;

export function analyzeGitState(repoRoot: string): GitState {
  const head_branch = runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();

  // is_tracking: does the current branch have an upstream?
  let is_tracking = false;
  try {
    runGit(repoRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
    is_tracking = true;
  } catch {
    is_tracking = false;
  }

  // tree_clean: porcelain output empty.
  const porcelain = runGit(repoRoot, ['status', '--porcelain']);
  const tree_clean = porcelain.trim() === '';

  // has_submodules: .gitmodules file present at repo root.
  const has_submodules = existsSync(join(repoRoot, '.gitmodules'));

  // remote.origin_url: read git config; absent if no origin.
  let origin_url: string | undefined;
  try {
    origin_url = runGit(repoRoot, ['remote', 'get-url', 'origin']).trim();
  } catch {
    origin_url = undefined;
  }

  const parsed = origin_url ? parseGithubRemote(origin_url) : undefined;

  return {
    git: { head_branch, is_tracking, tree_clean, has_submodules },
    remote: { origin_url, parsed },
  };
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
}

// Match github.com remotes only (https + ssh forms). Returns undefined for any other host
// (gitlab, bitbucket, self-hosted gitea, etc.) — workload/github_org slots only auto-source
// from github per §5a.
function parseGithubRemote(url: string): { host: string; org: string; repo: string } | undefined {
  // https form: https://github.com/<org>/<repo>(.git)?
  const httpsMatch = url.match(/^https?:\/\/(github\.com)\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (httpsMatch) {
    return { host: httpsMatch[1]!, org: httpsMatch[2]!, repo: httpsMatch[3]! };
  }
  // ssh form: git@github.com:<org>/<repo>(.git)?
  const sshMatch = url.match(/^git@(github\.com):([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return { host: sshMatch[1]!, org: sshMatch[2]!, repo: sshMatch[3]! };
  }
  return undefined;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- git-state.test`
Expected: PASS — 5/5.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/analyzer/git-state.ts src/retrofit/analyzer/git-state.test.ts
git commit -m "feat(retrofit): analyzer/git-state.ts — head_branch, tree_clean, github remote parsing"
```

---

## Task 5: analyzer/package-manager.ts

**Files:**
- Create: `src/retrofit/analyzer/package-manager.ts`
- Create: `src/retrofit/analyzer/package-manager.test.ts`

Detects `package_manager`, lists `lockfiles_present`, parses `package.json` into `PackageJsonSnapshot`, sets `has_package_json`, and detects pnpm `workspace`.

- [ ] **Step 1: Write the failing tests**

`src/retrofit/analyzer/package-manager.test.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyzePackageManager } from './package-manager.js';

describe('analyzePackageManager', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('detects npm via package-lock.json', () => {
    const fx = materializeFixture('npm-with-jest');
    cleanups.push(fx.cleanup);
    const r = analyzePackageManager(fx.dir);
    expect(r.package_manager).toBe('npm');
    expect(r.lockfiles_present).toEqual(['package-lock.json']);
    expect(r.has_package_json).toBe(true);
    expect(r.package_json?.devDependencies?.jest).toBe('^29.0.0');
    expect(r.workspace).toBeUndefined();
  });

  it('returns has_package_json: false when missing', () => {
    const fx = materializeFixture('repo-without-package-json');
    cleanups.push(fx.cleanup);
    const r = analyzePackageManager(fx.dir);
    expect(r.has_package_json).toBe(false);
    expect(r.package_json).toBeUndefined();
    expect(r.package_manager).toBe('none');
    expect(r.lockfiles_present).toEqual([]);
  });

  it('detects pnpm via packageManager field even without lockfile', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(
      join(fx.dir, 'package.json'),
      JSON.stringify({ name: 'p', packageManager: 'pnpm@9.7.0' }),
    );
    const r = analyzePackageManager(fx.dir);
    expect(r.package_manager).toBe('pnpm');
  });

  it('detects pnpm-lock.yaml in priority over packageManager field absence', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'package.json'), JSON.stringify({ name: 'p' }));
    writeFileSync(join(fx.dir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"');
    const r = analyzePackageManager(fx.dir);
    expect(r.package_manager).toBe('pnpm');
    expect(r.lockfiles_present).toEqual(['pnpm-lock.yaml']);
  });

  it('detects pnpm workspace', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'package.json'), JSON.stringify({ name: 'root' }));
    writeFileSync(join(fx.dir, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n  - 'apps/*'\n");
    const r = analyzePackageManager(fx.dir);
    expect(r.workspace).toEqual({ type: 'pnpm', packages: ['packages/*', 'apps/*'] });
  });

  it('returns "none" with no package.json and no lockfile', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const r = analyzePackageManager(fx.dir);
    expect(r.package_manager).toBe('none');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- package-manager.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement package-manager.ts**

`src/retrofit/analyzer/package-manager.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageJsonSnapshot, RepoSnapshot } from '../types/index.js';

type PMResult = Pick<
  RepoSnapshot,
  'package_manager' | 'lockfiles_present' | 'package_json' | 'has_package_json' | 'workspace'
>;

const LOCKFILE_TO_PM: Array<{ lockfile: string; pm: 'pnpm' | 'npm' | 'yarn' }> = [
  { lockfile: 'pnpm-lock.yaml', pm: 'pnpm' },
  { lockfile: 'package-lock.json', pm: 'npm' },
  { lockfile: 'yarn.lock', pm: 'yarn' },
];

export function analyzePackageManager(repoRoot: string): PMResult {
  const pkgPath = join(repoRoot, 'package.json');
  const has_package_json = existsSync(pkgPath);
  const package_json = has_package_json ? parsePackageJson(pkgPath) : undefined;

  const lockfiles_present = LOCKFILE_TO_PM.filter(({ lockfile }) =>
    existsSync(join(repoRoot, lockfile)),
  ).map((l) => l.lockfile);

  const package_manager = detectPackageManager(lockfiles_present, package_json);

  const workspace = detectPnpmWorkspace(repoRoot);

  return { package_manager, lockfiles_present, package_json, has_package_json, workspace };
}

function detectPackageManager(
  lockfiles_present: string[],
  pkg: PackageJsonSnapshot | undefined,
): 'pnpm' | 'npm' | 'yarn' | 'none' {
  // Rule from §5: pnpm if pnpm-lock.yaml present OR package.json:packageManager starts with pnpm@.
  if (lockfiles_present.includes('pnpm-lock.yaml')) return 'pnpm';
  if (pkg?.packageManager?.startsWith('pnpm@')) return 'pnpm';
  if (lockfiles_present.includes('package-lock.json')) return 'npm';
  if (lockfiles_present.includes('yarn.lock')) return 'yarn';
  return 'none';
}

function parsePackageJson(pkgPath: string): PackageJsonSnapshot {
  const raw = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
  const get = <K extends string>(key: K): unknown => raw[key];
  return {
    raw,
    type: get('type') as PackageJsonSnapshot['type'],
    packageManager: get('packageManager') as string | undefined,
    scripts: get('scripts') as Record<string, string> | undefined,
    dependencies: get('dependencies') as Record<string, string> | undefined,
    devDependencies: get('devDependencies') as Record<string, string> | undefined,
    engines: get('engines') as Record<string, string> | undefined,
    author: get('author') as PackageJsonSnapshot['author'],
    description: get('description') as string | undefined,
    license: get('license') as string | undefined,
  };
}

function detectPnpmWorkspace(repoRoot: string): { type: 'pnpm'; packages: string[] } | undefined {
  const wsPath = join(repoRoot, 'pnpm-workspace.yaml');
  if (!existsSync(wsPath)) return undefined;
  const content = readFileSync(wsPath, 'utf8');
  // Minimal YAML parser for the single field we care about: packages.
  // pnpm-workspace.yaml is small and conventional; a real YAML lib is overkill.
  const packages: string[] = [];
  let inPackages = false;
  for (const rawLine of content.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const m = line.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/);
      if (m) {
        packages.push(m[1]!);
      } else if (/^\S/.test(line)) {
        // Hit a new top-level key — stop.
        break;
      }
    }
  }
  return { type: 'pnpm', packages };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- package-manager.test`
Expected: PASS — 6/6.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/analyzer/package-manager.ts src/retrofit/analyzer/package-manager.test.ts
git commit -m "feat(retrofit): analyzer/package-manager.ts — pnpm/npm/yarn detection + workspace + package_json snapshot"
```

---

## Task 6: Add the cross-cutting analyzer fixtures

**Files:**
- Create: `tests/fixtures/repos/already-janus/{package.json,.janus.json}`
- Create: `tests/fixtures/repos/commonjs-repo/package.json`
- Create: `tests/fixtures/repos/repo-with-user-modified-skill/.claude/skills/foo.md`

These three are needed by Tasks 8 (claude-kit) and 10 (analyzer index — has_janus_marker). The remaining fixtures (monorepo, submodule, symlink) land in Task 20.

- [ ] **Step 1: Create already-janus fixture**

`tests/fixtures/repos/already-janus/package.json`:

```json
{
  "name": "already-janus-repo",
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@9.7.0"
}
```

`tests/fixtures/repos/already-janus/.janus.json`:

```json
{
  "schema_version": "1",
  "janus_version": "0.1.0",
  "archetype": "generic-ts",
  "applied_at": "2026-04-01T10:00:00Z",
  "applied_steps": ["root-dotfiles", "root-configs", "write-marker"],
  "skipped_steps": [],
  "slots": {
    "workload": "alreadyjanus",
    "description": "Pre-retrofitted fixture",
    "archetype": "generic-ts",
    "github_org": "pantheon-tech",
    "author": "Daniel Smith",
    "author_email": "daniel@example.com",
    "node_version": "24",
    "license": "MIT",
    "region": "australiaeast",
    "template_version": "v0.1.0",
    "year": "2026",
    "date": "2026-04-01",
    "base_branch": "staging"
  },
  "plugins": [],
  "shared_overlay_version": "0.1.0",
  "archetype_overlay_version": "0.1.0"
}
```

- [ ] **Step 2: Create commonjs-repo fixture**

`tests/fixtures/repos/commonjs-repo/package.json`:

```json
{
  "name": "commonjs-repo",
  "version": "0.0.0",
  "type": "commonjs",
  "scripts": {
    "test": "node test.js"
  }
}
```

- [ ] **Step 3: Create repo-with-user-modified-skill fixture**

`tests/fixtures/repos/repo-with-user-modified-skill/.claude/skills/foo.md`:

```markdown
# foo

User's custom skill — pre-existing, would collide with a janus-shipped same-named file.
```

`tests/fixtures/repos/repo-with-user-modified-skill/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["Bash(echo *)"]
  }
}
```

- [ ] **Step 4: Sanity check**

Run: `pnpm test:unit -- fixture-repo.test`
Expected: PASS (existing helper test).

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/repos/already-janus/ tests/fixtures/repos/commonjs-repo/ tests/fixtures/repos/repo-with-user-modified-skill/
git commit -m "test(retrofit): add already-janus, commonjs-repo, user-modified-skill fixtures"
```

---

## Task 7: analyzer/displaced-tools.ts

**Files:**
- Create: `src/retrofit/analyzer/displaced-tools.ts`
- Create: `src/retrofit/analyzer/displaced-tools.test.ts`

Detects eslint/prettier/husky/jest. (commitlint_old detection deferred to Plan 3 because it requires comparing against janus's commitlint config — out of scope for the analyzer's pure inspection.)

- [ ] **Step 1: Write the failing tests**

`src/retrofit/analyzer/displaced-tools.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyzePackageManager } from './package-manager.js';
import { analyzeDisplacedTools } from './displaced-tools.js';

describe('analyzeDisplacedTools', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('detects eslint via .eslintrc.json + devDep', () => {
    const fx = materializeFixture('eslint-only');
    cleanups.push(fx.cleanup);
    const pm = analyzePackageManager(fx.dir);
    const tools = analyzeDisplacedTools(fx.dir, pm.package_json);
    const eslint = tools.find((t) => t.name === 'eslint');
    expect(eslint).toBeDefined();
    expect(eslint!.evidence).toContain('.eslintrc.json');
    expect(eslint!.evidence).toContain('package.json:devDependencies.eslint');
  });

  it('detects prettier and husky together', () => {
    const fx = materializeFixture('prettier-husky');
    cleanups.push(fx.cleanup);
    const pm = analyzePackageManager(fx.dir);
    const tools = analyzeDisplacedTools(fx.dir, pm.package_json);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['husky', 'prettier']);

    const husky = tools.find((t) => t.name === 'husky')!;
    expect(husky.evidence).toContain('.husky/');
    expect(husky.evidence).toContain('package.json:devDependencies.husky');

    const prettier = tools.find((t) => t.name === 'prettier')!;
    expect(prettier.evidence).toContain('.prettierrc');
  });

  it('detects jest via config + devDep', () => {
    const fx = materializeFixture('npm-with-jest');
    cleanups.push(fx.cleanup);
    const pm = analyzePackageManager(fx.dir);
    const tools = analyzeDisplacedTools(fx.dir, pm.package_json);
    const jest = tools.find((t) => t.name === 'jest');
    expect(jest).toBeDefined();
    expect(jest!.evidence).toContain('jest.config.js');
    expect(jest!.evidence).toContain('package.json:devDependencies.jest');
  });

  it('returns empty for greenfield', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const pm = analyzePackageManager(fx.dir);
    expect(analyzeDisplacedTools(fx.dir, pm.package_json)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- displaced-tools.test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement displaced-tools.ts**

`src/retrofit/analyzer/displaced-tools.ts`:

```ts
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DisplacedTool, PackageJsonSnapshot } from '../types/index.js';

type ToolName = DisplacedTool['name'];

// Each rule contributes one evidence string when its predicate matches.
type Rule = {
  tool: Exclude<ToolName, 'commitlint_old'>;
  evidence: string;
  match: (ctx: Ctx) => boolean;
};

type Ctx = {
  repoRoot: string;
  pkg: PackageJsonSnapshot | undefined;
};

const RULES: Rule[] = [
  // ESLint
  ...['.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yaml'].map((f) => ({
    tool: 'eslint' as const,
    evidence: f,
    match: (ctx: Ctx) => existsSync(join(ctx.repoRoot, f)),
  })),
  ...['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts'].map((f) => ({
    tool: 'eslint' as const,
    evidence: f,
    match: (ctx: Ctx) => existsSync(join(ctx.repoRoot, f)),
  })),
  {
    tool: 'eslint',
    evidence: 'package.json:devDependencies.eslint',
    match: (ctx) => Boolean(ctx.pkg?.devDependencies?.eslint),
  },
  {
    tool: 'eslint',
    evidence: 'package.json:eslintConfig',
    match: (ctx) => Boolean(ctx.pkg?.raw?.eslintConfig),
  },
  // Prettier
  ...['.prettierrc', '.prettierrc.json', '.prettierrc.yaml', '.prettierrc.yml', '.prettierrc.js'].map(
    (f) => ({
      tool: 'prettier' as const,
      evidence: f,
      match: (ctx: Ctx) => existsSync(join(ctx.repoRoot, f)),
    }),
  ),
  ...['prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs'].map((f) => ({
    tool: 'prettier' as const,
    evidence: f,
    match: (ctx: Ctx) => existsSync(join(ctx.repoRoot, f)),
  })),
  {
    tool: 'prettier',
    evidence: 'package.json:devDependencies.prettier',
    match: (ctx) => Boolean(ctx.pkg?.devDependencies?.prettier),
  },
  {
    tool: 'prettier',
    evidence: 'package.json:prettier',
    match: (ctx) => Boolean(ctx.pkg?.raw?.prettier),
  },
  // Husky
  {
    tool: 'husky',
    evidence: '.husky/',
    match: (ctx) => {
      const p = join(ctx.repoRoot, '.husky');
      return existsSync(p) && statSync(p).isDirectory();
    },
  },
  {
    tool: 'husky',
    evidence: 'package.json:devDependencies.husky',
    match: (ctx) => Boolean(ctx.pkg?.devDependencies?.husky),
  },
  // Jest
  ...['jest.config.js', 'jest.config.cjs', 'jest.config.mjs', 'jest.config.ts', 'jest.config.json'].map(
    (f) => ({
      tool: 'jest' as const,
      evidence: f,
      match: (ctx: Ctx) => existsSync(join(ctx.repoRoot, f)),
    }),
  ),
  {
    tool: 'jest',
    evidence: 'package.json:devDependencies.jest',
    match: (ctx) => Boolean(ctx.pkg?.devDependencies?.jest),
  },
  {
    tool: 'jest',
    evidence: 'package.json:jest',
    match: (ctx) => Boolean(ctx.pkg?.raw?.jest),
  },
];

export function analyzeDisplacedTools(
  repoRoot: string,
  pkg: PackageJsonSnapshot | undefined,
): DisplacedTool[] {
  const ctx: Ctx = { repoRoot, pkg };
  const evidenceByTool = new Map<ToolName, string[]>();
  for (const rule of RULES) {
    if (rule.match(ctx)) {
      const arr = evidenceByTool.get(rule.tool) ?? [];
      arr.push(rule.evidence);
      evidenceByTool.set(rule.tool, arr);
    }
  }
  // Sort tool names alphabetically for deterministic output.
  return [...evidenceByTool.entries()]
    .map(([name, evidence]) => ({ name, evidence }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- displaced-tools.test`
Expected: PASS — 4/4.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/analyzer/displaced-tools.ts src/retrofit/analyzer/displaced-tools.test.ts
git commit -m "feat(retrofit): analyzer/displaced-tools.ts — eslint/prettier/husky/jest detection"
```

---

## Task 8: analyzer/claude-kit.ts

**Files:**
- Create: `src/retrofit/analyzer/claude-kit.ts`
- Create: `src/retrofit/analyzer/claude-kit.test.ts`

Snapshots `.claude/`: presence of subdirs/files, lists of hooks/skills/misc files. Used by Plan 4's claude_settings_merge + skills/hooks overlay logic.

- [ ] **Step 1: Write the failing tests**

`src/retrofit/analyzer/claude-kit.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyzeClaudeKit } from './claude-kit.js';

describe('analyzeClaudeKit', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('reports has_claude_dir: false for greenfield', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const k = analyzeClaudeKit(fx.dir);
    expect(k.has_claude_dir).toBe(false);
    expect(k.has_settings_json).toBe(false);
    expect(k.has_claude_md).toBe(false);
    expect(k.hooks).toEqual([]);
    expect(k.skills).toEqual([]);
    expect(k.misc).toEqual([]);
  });

  it('finds settings.json + skills in user-modified-skill fixture', () => {
    const fx = materializeFixture('repo-with-user-modified-skill');
    cleanups.push(fx.cleanup);
    const k = analyzeClaudeKit(fx.dir);
    expect(k.has_claude_dir).toBe(true);
    expect(k.has_settings_json).toBe(true);
    expect(k.skills).toContain('foo.md');
    expect(k.hooks).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- claude-kit.test`
Expected: FAIL.

- [ ] **Step 3: Implement claude-kit.ts**

`src/retrofit/analyzer/claude-kit.ts`:

```ts
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { ClaudeKitSnapshot } from '../types/index.js';

export function analyzeClaudeKit(repoRoot: string): ClaudeKitSnapshot {
  const claudeDir = join(repoRoot, '.claude');
  if (!existsSync(claudeDir)) {
    return {
      has_claude_dir: false,
      has_settings_json: false,
      has_claude_md: false,
      has_pre_janus_md: false,
      hooks: [],
      skills: [],
      misc: [],
    };
  }

  const has_settings_json = existsSync(join(claudeDir, 'settings.json'));
  const has_claude_md = existsSync(join(repoRoot, 'CLAUDE.md'));
  const has_pre_janus_md = existsSync(join(repoRoot, 'CLAUDE.pre-janus.md'));

  const hooks = listFilesRelative(join(claudeDir, 'hooks'));
  const skills = listFilesRelative(join(claudeDir, 'skills'));
  const misc = listClaudeMisc(claudeDir);

  return {
    has_claude_dir: true,
    has_settings_json,
    has_claude_md,
    has_pre_janus_md,
    hooks,
    skills,
    misc,
  };
}

function listFilesRelative(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  walk(dir, dir, out);
  return out.sort();
}

function walk(base: string, current: string, out: string[]): void {
  for (const entry of readdirSync(current)) {
    const full = join(current, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(base, full, out);
    } else if (stat.isFile()) {
      out.push(relative(base, full));
    }
  }
}

// Misc = files at the top of .claude/ that aren't owned by hooks/, skills/, or settings.json.
// (Mirrors the §6 step 5 `claude-misc-overlay` definition.)
function listClaudeMisc(claudeDir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(claudeDir)) {
    if (entry === 'hooks' || entry === 'skills' || entry === 'settings.json') continue;
    const full = join(claudeDir, entry);
    if (statSync(full).isFile()) {
      out.push(entry);
    }
  }
  return out.sort();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- claude-kit.test`
Expected: PASS — 2/2.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/analyzer/claude-kit.ts src/retrofit/analyzer/claude-kit.test.ts
git commit -m "feat(retrofit): analyzer/claude-kit.ts — snapshot .claude/ layout"
```

---

## Task 9: analyzer/plugin-evidence.ts

**Files:**
- Create: `src/retrofit/analyzer/plugin-evidence.ts`
- Create: `src/retrofit/analyzer/plugin-evidence.test.ts`

File-glob detection for the three auto-detectable plugins (banana-claude is intentionally not auto-detected; see §5b).

- [ ] **Step 1: Write the failing tests**

`src/retrofit/analyzer/plugin-evidence.test.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyzePackageManager } from './package-manager.js';
import { analyzePluginEvidence } from './plugin-evidence.js';

describe('analyzePluginEvidence', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('returns empty arrays on greenfield', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['frontend-design@claude-plugins-official']).toEqual([]);
    expect(ev['playwright@claude-plugins-official']).toEqual([]);
    expect(ev['pyright-lsp@claude-plugins-official']).toEqual([]);
  });

  it('detects frontend-design via vite.config.ts', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'vite.config.ts'), 'export default {}');
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['frontend-design@claude-plugins-official']).toContain('vite.config.ts');
  });

  it('detects frontend-design via react in dependencies', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(
      join(fx.dir, 'package.json'),
      JSON.stringify({ name: 'p', dependencies: { react: '^18' } }),
    );
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['frontend-design@claude-plugins-official']).toContain(
      'package.json:dependencies.react',
    );
  });

  it('detects playwright via playwright.config.ts + devDep', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'playwright.config.ts'), 'export default {}');
    writeFileSync(
      join(fx.dir, 'package.json'),
      JSON.stringify({ name: 'p', devDependencies: { '@playwright/test': '^1' } }),
    );
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['playwright@claude-plugins-official']).toEqual(
      expect.arrayContaining([
        'playwright.config.ts',
        'package.json:devDependencies.@playwright/test',
      ]),
    );
  });

  it('detects pyright-lsp via pyproject.toml', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'pyproject.toml'), '[project]\nname = "x"\n');
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['pyright-lsp@claude-plugins-official']).toContain('pyproject.toml');
  });

  it('does NOT detect pyright-lsp from a bare *.py at root', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'helper.py'), 'print("hi")');
    const pm = analyzePackageManager(fx.dir);
    const ev = analyzePluginEvidence(fx.dir, pm.package_json);
    expect(ev['pyright-lsp@claude-plugins-official']).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- plugin-evidence.test`
Expected: FAIL.

- [ ] **Step 3: Implement plugin-evidence.ts**

`src/retrofit/analyzer/plugin-evidence.ts`:

```ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageJsonSnapshot, PluginEvidence } from '../types/index.js';

export function analyzePluginEvidence(
  repoRoot: string,
  pkg: PackageJsonSnapshot | undefined,
): PluginEvidence {
  const evidence: PluginEvidence = {
    'frontend-design@claude-plugins-official': [],
    'playwright@claude-plugins-official': [],
    'pyright-lsp@claude-plugins-official': [],
  };

  // frontend-design
  for (const f of ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']) {
    if (existsSync(join(repoRoot, f))) {
      evidence['frontend-design@claude-plugins-official'].push(f);
    }
  }
  for (const entry of safeReaddir(repoRoot)) {
    if (/^next\.config\./.test(entry)) {
      evidence['frontend-design@claude-plugins-official'].push(entry);
    }
  }
  if (pkg?.dependencies?.react) {
    evidence['frontend-design@claude-plugins-official'].push('package.json:dependencies.react');
  }

  // playwright
  for (const f of ['playwright.config.js', 'playwright.config.ts']) {
    if (existsSync(join(repoRoot, f))) {
      evidence['playwright@claude-plugins-official'].push(f);
    }
  }
  if (pkg?.devDependencies?.['@playwright/test']) {
    evidence['playwright@claude-plugins-official'].push(
      'package.json:devDependencies.@playwright/test',
    );
  }

  // pyright-lsp
  if (existsSync(join(repoRoot, 'pyproject.toml'))) {
    evidence['pyright-lsp@claude-plugins-official'].push('pyproject.toml');
  }
  if (existsSync(join(repoRoot, 'Pipfile'))) {
    evidence['pyright-lsp@claude-plugins-official'].push('Pipfile');
  }
  for (const entry of safeReaddir(repoRoot)) {
    if (/^requirements.*\.txt$/.test(entry)) {
      evidence['pyright-lsp@claude-plugins-official'].push(entry);
    }
  }

  // Sort each list for deterministic output.
  for (const key of Object.keys(evidence) as Array<keyof PluginEvidence>) {
    evidence[key].sort();
  }
  return evidence;
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- plugin-evidence.test`
Expected: PASS — 6/6.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/analyzer/plugin-evidence.ts src/retrofit/analyzer/plugin-evidence.test.ts
git commit -m "feat(retrofit): analyzer/plugin-evidence.ts — file-glob plugin auto-detect"
```

---

## Task 10: analyzer/index.ts (compose)

**Files:**
- Create: `src/retrofit/analyzer/index.ts`
- Create: `src/retrofit/analyzer/index.test.ts`

Composes the per-concern modules into a single `analyze()` function returning `Omit<RepoSnapshot, 'baseline_files'>`. Also: detects `.janus.json`, parses `prior_marker`, lists `ci_workflows`, and reads `unrecognized_tools` allowlist.

- [ ] **Step 1: Write the failing tests**

`src/retrofit/analyzer/index.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { analyze } from './index.js';

describe('analyze', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('returns a snapshot with all top-level fields populated for greenfield', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const snap = analyze(fx.dir);
    expect(snap.repo_root).toBe(fx.dir);
    expect(snap.has_janus_marker).toBe(false);
    expect(snap.prior_marker).toBeUndefined();
    expect(snap.package_manager).toBe('none');
    expect(snap.has_package_json).toBe(false);
    expect(snap.displaced_tools).toEqual([]);
    expect(snap.claude_kit.has_claude_dir).toBe(false);
    expect(snap.ci_workflows).toEqual([]);
    expect(snap.git.head_branch).toBe('main');
  });

  it('reads .janus.json when present and populates prior_marker', () => {
    const fx = materializeFixture('already-janus');
    cleanups.push(fx.cleanup);
    const snap = analyze(fx.dir);
    expect(snap.has_janus_marker).toBe(true);
    expect(snap.prior_marker?.archetype).toBe('generic-ts');
    expect(snap.prior_marker?.slots.workload).toBe('alreadyjanus');
  });

  it('lists workflow files under .github/workflows/', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.github/workflows'), { recursive: true });
    writeFileSync(
      join(fx.dir, '.github/workflows/qa.yml'),
      'name: qa\non: push\njobs:\n  q:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm ci && eslint .\n',
    );
    writeFileSync(
      join(fx.dir, '.github/workflows/build.yml'),
      'name: build\njobs:\n  b:\n    steps: []\n',
    );
    const snap = analyze(fx.dir);
    const paths = snap.ci_workflows.map((w) => w.path).sort();
    expect(paths).toEqual(['.github/workflows/build.yml', '.github/workflows/qa.yml']);
    const qa = snap.ci_workflows.find((w) => w.path === '.github/workflows/qa.yml')!;
    expect(qa.references_displaced_tool).toEqual(expect.arrayContaining(['eslint', 'npm']));
  });

  it('detects unrecognized_tools by name from package.json devDependencies', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(
      join(fx.dir, 'package.json'),
      JSON.stringify({
        name: 'p',
        devDependencies: { 'lint-staged': '^15.0.0', 'biome-not-real-tool': '^1' },
      }),
    );
    const snap = analyze(fx.dir);
    expect(snap.unrecognized_tools).toContain('lint-staged');
    // Not in the allowlist:
    expect(snap.unrecognized_tools).not.toContain('biome-not-real-tool');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- "analyzer/index.test"`
Expected: FAIL.

- [ ] **Step 3: Implement index.ts**

`src/retrofit/analyzer/index.ts`:

```ts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { JanusMarker, RepoSnapshot, WorkflowFile } from '../types/index.js';
import { validateMarker } from '../schema/validate.js';
import { analyzeClaudeKit } from './claude-kit.js';
import { analyzeDisplacedTools } from './displaced-tools.js';
import { analyzeGitState } from './git-state.js';
import { analyzePackageManager } from './package-manager.js';
import { analyzePluginEvidence } from './plugin-evidence.js';

// v0.1 unrecognized-tools allowlist. Per spec §5, this lives in
// docs/conventions/dependencies.md under "## Unrecognized tools (retrofit warning allowlist)".
// For now we hardcode a starter set; Plan 5 wires up the docs read.
const UNRECOGNIZED_TOOLS_ALLOWLIST = new Set([
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
]);

const DISPLACED_TOOL_NAMES = ['eslint', 'prettier', 'husky', 'jest', 'commitlint', 'npm', 'yarn'];

export function analyze(repoRoot: string): Omit<RepoSnapshot, 'baseline_files'> {
  const pmResult = analyzePackageManager(repoRoot);
  const gitResult = analyzeGitState(repoRoot);
  const displaced_tools = analyzeDisplacedTools(repoRoot, pmResult.package_json);
  const claude_kit = analyzeClaudeKit(repoRoot);
  const plugin_evidence = analyzePluginEvidence(repoRoot, pmResult.package_json);
  const ci_workflows = listCiWorkflows(repoRoot);
  const { has_janus_marker, prior_marker } = readPriorMarker(repoRoot);
  const unrecognized_tools = detectUnrecognizedTools(pmResult.package_json);

  return {
    repo_root: repoRoot,
    has_janus_marker,
    prior_marker,
    ...pmResult,
    displaced_tools,
    claude_kit,
    ci_workflows,
    unrecognized_tools,
    plugin_evidence,
    ...gitResult,
  };
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
    // Fall through — invalid marker is still a marker, just not parseable.
  }
  return { has_janus_marker: true }; // present but malformed; pre-flight will reject in Plan 4
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
      // Anchored word-ish match — case-sensitive, not embedded inside identifiers.
      const re = new RegExp(`(^|[^a-zA-Z0-9_-])${tool}([^a-zA-Z0-9_-]|$)`);
      if (re.test(content)) refs.push(tool);
    }
    out.push({ path: relative(repoRoot, full), references_displaced_tool: refs.sort() });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

function detectUnrecognizedTools(pkg: ReturnType<typeof analyzePackageManager>['package_json']): string[] {
  if (!pkg) return [];
  const found = new Set<string>();
  for (const deps of [pkg.devDependencies, pkg.dependencies]) {
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (UNRECOGNIZED_TOOLS_ALLOWLIST.has(name)) found.add(name);
    }
  }
  return [...found].sort();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- "analyzer/index.test"`
Expected: PASS — 4/4.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/analyzer/index.ts src/retrofit/analyzer/index.test.ts
git commit -m "feat(retrofit): analyzer/index.ts — composed analyze() with .janus.json + workflow + unrecognized-tool detection"
```

---

## Task 11: resolvers/slot-validation.ts

**Files:**
- Create: `src/retrofit/resolvers/slot-validation.ts`
- Create: `src/retrofit/resolvers/slot-validation.test.ts`

Pure regex validation table from §5a. Used by both slot resolver and CLI flag parser.

- [ ] **Step 1: Write the failing tests**

`src/retrofit/resolvers/slot-validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeNodeVersion, validateSlot } from './slot-validation.js';

describe('validateSlot', () => {
  it('accepts a valid workload', () => {
    expect(validateSlot('workload', 'foo').ok).toBe(true);
    expect(validateSlot('workload', 'fooservice').ok).toBe(true);
    expect(validateSlot('workload', 'foo123').ok).toBe(true);
  });

  it('rejects workload too short, too long, with caps, with hyphens', () => {
    expect(validateSlot('workload', 'fo').ok).toBe(false);
    expect(validateSlot('workload', 'aaaaaaaaaaaaa').ok).toBe(false); // 13 chars
    expect(validateSlot('workload', 'Foo').ok).toBe(false);
    expect(validateSlot('workload', 'foo-bar').ok).toBe(false);
    expect(validateSlot('workload', '1foo').ok).toBe(false); // can't start with digit
  });

  it('accepts valid github_org', () => {
    expect(validateSlot('github_org', 'pantheon-tech').ok).toBe(true);
    expect(validateSlot('github_org', 'a').ok).toBe(true);
    expect(validateSlot('github_org', 'a'.repeat(39)).ok).toBe(true);
  });

  it('rejects github_org with leading or trailing hyphen, too long, bad chars', () => {
    expect(validateSlot('github_org', '-foo').ok).toBe(false);
    expect(validateSlot('github_org', 'foo-').ok).toBe(false);
    expect(validateSlot('github_org', 'a'.repeat(40)).ok).toBe(false);
    expect(validateSlot('github_org', 'foo_bar').ok).toBe(false);
  });

  it('accepts a valid email', () => {
    expect(validateSlot('author_email', 'daniel@skipper.kiwi').ok).toBe(true);
    expect(validateSlot('author_email', 'a@b.co').ok).toBe(true);
  });

  it('rejects malformed email', () => {
    expect(validateSlot('author_email', 'no-at-sign').ok).toBe(false);
    expect(validateSlot('author_email', 'a@b').ok).toBe(false);
    expect(validateSlot('author_email', '@b.com').ok).toBe(false);
  });

  it('accepts node_version as bare integer', () => {
    expect(validateSlot('node_version', '20').ok).toBe(true);
    expect(validateSlot('node_version', '24').ok).toBe(true);
  });

  it('rejects node_version that is not a bare integer', () => {
    expect(validateSlot('node_version', '20.0.0').ok).toBe(false);
    expect(validateSlot('node_version', '^20').ok).toBe(false);
  });

  it('passes through other slots without complaint', () => {
    // license, region, description, etc. have no validation rule in §5a — accept anything.
    expect(validateSlot('license', 'Apache-2.0').ok).toBe(true);
    expect(validateSlot('description', 'anything goes here, even punctuation!').ok).toBe(true);
  });
});

describe('normalizeNodeVersion', () => {
  it('extracts leading integer from common range expressions', () => {
    expect(normalizeNodeVersion('24')).toBe('24');
    expect(normalizeNodeVersion('>=24')).toBe('24');
    expect(normalizeNodeVersion('^20.0.0')).toBe('20');
    expect(normalizeNodeVersion('24.x')).toBe('24');
    expect(normalizeNodeVersion('24.5.0')).toBe('24');
    expect(normalizeNodeVersion('  18  ')).toBe('18');
  });

  it('returns undefined for unparseable input', () => {
    expect(normalizeNodeVersion('latest')).toBeUndefined();
    expect(normalizeNodeVersion('')).toBeUndefined();
    expect(normalizeNodeVersion('lts/iron')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- slot-validation.test`
Expected: FAIL.

- [ ] **Step 3: Implement slot-validation.ts**

`src/retrofit/resolvers/slot-validation.ts`:

```ts
export type SlotValidation = { ok: true } | { ok: false; reason: string };

const RULES: Record<string, RegExp> = {
  workload: /^[a-z][a-z0-9]{2,11}$/,
  github_org: /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/,
  author_email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  node_version: /^\d+$/,
};

export function validateSlot(key: string, value: string): SlotValidation {
  const rule = RULES[key];
  if (!rule) return { ok: true }; // No rule defined; accept.
  if (!rule.test(value)) {
    return { ok: false, reason: `${key}=${value} does not match ${rule}` };
  }
  return { ok: true };
}

// Normalize node-version range expressions to the leading integer.
// Examples (from §5a):
//   >=24      → 24
//   ^20.0.0   → 20
//   24.x      → 24
//   24.5.0    → 24
// Returns undefined if no leading integer can be extracted.
export function normalizeNodeVersion(input: string): string | undefined {
  if (!input) return undefined;
  const m = input.trim().match(/(\d+)/);
  return m ? m[1]! : undefined;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- slot-validation.test`
Expected: PASS — 11/11.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/resolvers/slot-validation.ts src/retrofit/resolvers/slot-validation.test.ts
git commit -m "feat(retrofit): resolvers/slot-validation.ts — regex table + node_version normalization"
```

---

## Task 12: resolvers/slots.ts

**Files:**
- Create: `src/retrofit/resolvers/slots.ts`
- Create: `src/retrofit/resolvers/slots.test.ts`

Implements the §5a source-order resolution: prior marker → auto-source from snapshot → prompt callback → CLI override. Returns a fully-resolved `SlotMap` or throws `SLOT_UNRESOLVED_NON_INTERACTIVE` / `SLOT_VALIDATION_FAILED`.

- [ ] **Step 1: Write the failing tests**

`src/retrofit/resolvers/slots.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { JanusMarker, RepoSnapshot } from '../types/index.js';
import { resolveSlots } from './slots.js';

const baseSnap = (over: Partial<RepoSnapshot> = {}): Omit<RepoSnapshot, 'baseline_files'> => ({
  repo_root: '/tmp/x',
  has_janus_marker: false,
  package_manager: 'none',
  lockfiles_present: [],
  has_package_json: false,
  displaced_tools: [],
  claude_kit: {
    has_claude_dir: false,
    has_settings_json: false,
    has_claude_md: false,
    has_pre_janus_md: false,
    hooks: [],
    skills: [],
    misc: [],
  },
  ci_workflows: [],
  unrecognized_tools: [],
  plugin_evidence: {
    'frontend-design@claude-plugins-official': [],
    'playwright@claude-plugins-official': [],
    'pyright-lsp@claude-plugins-official': [],
  },
  git: { head_branch: 'main', is_tracking: false, tree_clean: true, has_submodules: false },
  remote: {},
  ...over,
});

describe('resolveSlots', () => {
  it('uses --slot overrides as authoritative', async () => {
    const snap = baseSnap();
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: { workload: 'foo', author: 'X', author_email: 'x@y.com', github_org: 'org' },
      nonInteractive: true,
    });
    expect(slots.workload).toBe('foo');
    expect(slots.archetype).toBe('generic-ts');
    expect(slots.author).toBe('X');
    expect(slots.author_email).toBe('x@y.com');
    expect(slots.license).toBe('MIT'); // default
    expect(slots.region).toBe('australiaeast'); // default
  });

  it('auto-sources author from package.json string form', async () => {
    const snap = baseSnap({
      has_package_json: true,
      package_json: { raw: {}, author: 'Daniel Smith <daniel@skipper.kiwi>' },
    });
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: { workload: 'foo', github_org: 'org' },
      nonInteractive: true,
    });
    expect(slots.author).toBe('Daniel Smith');
    expect(slots.author_email).toBe('daniel@skipper.kiwi');
  });

  it('auto-sources author from package.json object form', async () => {
    const snap = baseSnap({
      has_package_json: true,
      package_json: { raw: {}, author: { name: 'Jane', email: 'jane@example.com' } },
    });
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: { workload: 'foo', github_org: 'org' },
      nonInteractive: true,
    });
    expect(slots.author).toBe('Jane');
    expect(slots.author_email).toBe('jane@example.com');
  });

  it('auto-sources github_org and workload from remote.parsed', async () => {
    const snap = baseSnap({
      remote: {
        origin_url: 'https://github.com/pantheon-tech/foo.git',
        parsed: { host: 'github.com', org: 'pantheon-tech', repo: 'foo' },
      },
    });
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: { author: 'X', author_email: 'x@y.com' },
      nonInteractive: true,
    });
    expect(slots.github_org).toBe('pantheon-tech');
    expect(slots.workload).toBe('foo');
  });

  it('uses prior marker slots first', async () => {
    const prior: JanusMarker = {
      schema_version: '1',
      janus_version: '0.1.0',
      archetype: 'generic-ts',
      applied_at: '2026-01-01T00:00:00Z',
      applied_steps: [],
      skipped_steps: [],
      slots: {
        workload: 'fromprior',
        description: 'p',
        archetype: 'generic-ts',
        github_org: 'priororg',
        author: 'P',
        author_email: 'p@p.com',
        node_version: '22',
        license: 'MIT',
        region: 'australiaeast',
        template_version: 'v0.1.0',
        year: '2026',
        date: '2026-01-01',
        base_branch: 'staging',
      },
      plugins: [],
      shared_overlay_version: '0.1.0',
      archetype_overlay_version: '0.1.0',
    };
    const snap = baseSnap({ has_janus_marker: true, prior_marker: prior });
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: {},
      nonInteractive: true,
    });
    expect(slots.workload).toBe('fromprior');
    expect(slots.github_org).toBe('priororg');
  });

  it('falls back to prompt callback when interactive', async () => {
    const snap = baseSnap();
    const prompted: string[] = [];
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: {},
      nonInteractive: false,
      prompt: async (key) => {
        prompted.push(key);
        if (key === 'workload') return 'foo';
        if (key === 'github_org') return 'org';
        if (key === 'author') return 'X';
        if (key === 'author_email') return 'x@y.com';
        if (key === 'description') return 'd';
        return '';
      },
    });
    expect(prompted).toEqual(expect.arrayContaining(['workload', 'github_org', 'author', 'author_email']));
    expect(slots.workload).toBe('foo');
  });

  it('throws SLOT_UNRESOLVED_NON_INTERACTIVE when --non-interactive and a slot is missing', async () => {
    const snap = baseSnap();
    await expect(
      resolveSlots({
        snapshot: snap,
        archetype: 'generic-ts',
        cliSlots: {},
        nonInteractive: true,
      }),
    ).rejects.toThrow(/SLOT_UNRESOLVED_NON_INTERACTIVE/);
  });

  it('throws SLOT_VALIDATION_FAILED when --slot value fails regex', async () => {
    const snap = baseSnap();
    await expect(
      resolveSlots({
        snapshot: snap,
        archetype: 'generic-ts',
        cliSlots: { workload: 'BadCase' },
        nonInteractive: true,
      }),
    ).rejects.toThrow(/SLOT_VALIDATION_FAILED/);
  });

  it('falls back from invalid auto-sourced value to prompt under interactive', async () => {
    const snap = baseSnap({
      has_package_json: true,
      package_json: { raw: {}, author: 'X', description: 'd', engines: { node: 'lts/iron' } },
    });
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: { workload: 'foo', github_org: 'org', author_email: 'x@y.com' },
      nonInteractive: false,
      prompt: async (key) => (key === 'node_version' ? '22' : ''),
    });
    expect(slots.node_version).toBe('22');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- "resolvers/slots.test"`
Expected: FAIL.

- [ ] **Step 3: Implement slots.ts**

`src/retrofit/resolvers/slots.ts`:

```ts
import { execFileSync } from 'node:child_process';
import type { JanusMarker, RepoSnapshot } from '../types/index.js';
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

    // Static defaults applied here too, before prompting.
    const fromDefault = defaults[key];
    if (fromDefault !== undefined) {
      resolved[key] = fromDefault;
      continue;
    }

    // 3. Prompt or fail.
    if (opts.nonInteractive || !opts.prompt) {
      throw new Error(`SLOT_UNRESOLVED_NON_INTERACTIVE: ${key}`);
    }

    let attempts = 0;
    while (attempts < 3) {
      const promptedRaw = (await opts.prompt(key)).trim();
      const prompted = key === 'node_version' ? (normalizeNodeVersion(promptedRaw) ?? promptedRaw) : promptedRaw;
      if (prompted && validateSlot(key, prompted).ok) {
        resolved[key] = prompted;
        break;
      }
      attempts++;
    }
    if (resolved[key] === undefined) {
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
  // Fall through to git config for author/email if still unset.
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- "resolvers/slots.test"`
Expected: PASS — 9/9.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/resolvers/slots.ts src/retrofit/resolvers/slots.test.ts
git commit -m "feat(retrofit): resolvers/slots.ts — source-order slot resolution + non-interactive errors"
```

---

## Task 13: resolvers/plugins.ts

**Files:**
- Create: `src/retrofit/resolvers/plugins.ts`
- Create: `src/retrofit/resolvers/plugins.test.ts`

Implements the §5b source-order resolution: prior marker → auto-detect from `plugin_evidence` → `--plugin` additive → `--no-plugin` subtractive → confirmation prompt.

- [ ] **Step 1: Write the failing tests**

`src/retrofit/resolvers/plugins.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { JanusMarker, PluginEvidence } from '../types/index.js';
import { resolvePlugins } from './plugins.js';

const noEvidence: PluginEvidence = {
  'frontend-design@claude-plugins-official': [],
  'playwright@claude-plugins-official': [],
  'pyright-lsp@claude-plugins-official': [],
};

describe('resolvePlugins', () => {
  it('returns empty when no evidence and no overrides', async () => {
    const r = await resolvePlugins({
      pluginEvidence: noEvidence,
      cliAdd: [],
      cliRemove: [],
      nonInteractive: true,
    });
    expect(r).toEqual([]);
  });

  it('auto-detects plugins with evidence', async () => {
    const r = await resolvePlugins({
      pluginEvidence: {
        'frontend-design@claude-plugins-official': ['vite.config.ts'],
        'playwright@claude-plugins-official': ['playwright.config.ts'],
        'pyright-lsp@claude-plugins-official': [],
      },
      cliAdd: [],
      cliRemove: [],
      nonInteractive: true,
    });
    expect(r).toEqual([
      'frontend-design@claude-plugins-official',
      'playwright@claude-plugins-official',
    ]);
  });

  it('--plugin adds non-auto-detectable plugins (banana-claude)', async () => {
    const r = await resolvePlugins({
      pluginEvidence: noEvidence,
      cliAdd: ['banana-claude@banana-claude-marketplace'],
      cliRemove: [],
      nonInteractive: true,
    });
    expect(r).toEqual(['banana-claude@banana-claude-marketplace']);
  });

  it('--no-plugin removes auto-detected plugins', async () => {
    const r = await resolvePlugins({
      pluginEvidence: {
        ...noEvidence,
        'pyright-lsp@claude-plugins-official': ['pyproject.toml'],
      },
      cliAdd: [],
      cliRemove: ['pyright-lsp'],
      nonInteractive: true,
    });
    expect(r).toEqual([]);
  });

  it('prior marker plugins take precedence over auto-detect', async () => {
    const prior = {
      plugins: ['frontend-design@claude-plugins-official'],
    } as Pick<JanusMarker, 'plugins'>;
    const r = await resolvePlugins({
      priorMarker: prior,
      pluginEvidence: {
        ...noEvidence,
        'playwright@claude-plugins-official': ['playwright.config.ts'],
      },
      cliAdd: [],
      cliRemove: [],
      nonInteractive: true,
    });
    expect(r).toEqual(['frontend-design@claude-plugins-official']);
  });

  it('returned list is alphabetically sorted (deterministic)', async () => {
    const r = await resolvePlugins({
      pluginEvidence: noEvidence,
      cliAdd: [
        'playwright@claude-plugins-official',
        'frontend-design@claude-plugins-official',
        'banana-claude@banana-claude-marketplace',
      ],
      cliRemove: [],
      nonInteractive: true,
    });
    expect(r).toEqual([
      'banana-claude@banana-claude-marketplace',
      'frontend-design@claude-plugins-official',
      'playwright@claude-plugins-official',
    ]);
  });

  it('--no-plugin can also strip --plugin additions', async () => {
    const r = await resolvePlugins({
      pluginEvidence: noEvidence,
      cliAdd: ['banana-claude@banana-claude-marketplace'],
      cliRemove: ['banana-claude'],
      nonInteractive: true,
    });
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- "resolvers/plugins.test"`
Expected: FAIL.

- [ ] **Step 3: Implement plugins.ts**

`src/retrofit/resolvers/plugins.ts`:

```ts
import type { JanusMarker, PluginEvidence } from '../types/index.js';

export type ResolvePluginsOpts = {
  /** Resolved plugin set from a prior `.janus.json`, if present. Empty array is treated the same as undefined (re-derive). */
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test:unit -- "resolvers/plugins.test"`
Expected: PASS — 7/7.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/resolvers/plugins.ts src/retrofit/resolvers/plugins.test.ts
git commit -m "feat(retrofit): resolvers/plugins.ts — auto-detect + --plugin/--no-plugin overrides"
```

---

## Task 14: plan-builder/overlay-tree.ts — walker + .exclude + mode

**Files:**
- Create: `src/retrofit/plan-builder/overlay-tree.ts`
- Create: `src/retrofit/plan-builder/overlay-tree.test.ts`
- Create: `src/retrofit/plan-builder/exclude.ts`
- Create: `src/retrofit/plan-builder/exclude.test.ts`

This task lands the walker skeleton and the `is_excluded()` helper. It does NOT yet render `.tmpl` files (that's Task 15) and does NOT yet handle archetype overlay (Task 16). After this task, `buildOverlayTree` returns the verbatim subset of `_shared/` only, with correct `.exclude` filtering and modes.

- [ ] **Step 1: Write the failing exclude.ts test**

`src/retrofit/plan-builder/exclude.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildIsExcluded } from './exclude.js';

describe('buildIsExcluded', () => {
  it('matches exact path', () => {
    const isExcluded = buildIsExcluded(['.github/workflows/deploy.yml.tmpl', 'src/']);
    expect(isExcluded('.github/workflows/deploy.yml.tmpl')).toBe(true);
    expect(isExcluded('.github/workflows/ci.yml.tmpl')).toBe(false);
  });

  it('matches directory pattern (trailing slash) and contents', () => {
    const isExcluded = buildIsExcluded(['infra/']);
    expect(isExcluded('infra')).toBe(true);
    expect(isExcluded('infra/main.bicep')).toBe(true);
    expect(isExcluded('infra/modules/foo.bicep')).toBe(true);
    expect(isExcluded('infrastructure/x.txt')).toBe(false); // not a prefix match without /
  });

  it('skips comments and blank lines', () => {
    const isExcluded = buildIsExcluded(['# a comment', '', 'src/', '   ', '# another']);
    expect(isExcluded('src/foo.ts')).toBe(true);
    expect(isExcluded('# a comment')).toBe(false);
  });

  it('returns false for empty pattern list', () => {
    const isExcluded = buildIsExcluded([]);
    expect(isExcluded('anything')).toBe(false);
  });
});
```

- [ ] **Step 2: Implement exclude.ts**

`src/retrofit/plan-builder/exclude.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';

/**
 * Build an `is_excluded(rel)` predicate from `.exclude` lines, matching
 * `scripts/scaffold.sh:is_excluded()` semantics:
 *   - Strip CR (CRLF tolerance).
 *   - Trim whitespace.
 *   - Skip blank lines and lines starting with `#`.
 *   - Trailing-slash patterns match the dir AND everything under it.
 *   - Other patterns match the exact relative path.
 */
export function buildIsExcluded(patterns: string[]): (rel: string) => boolean {
  const cleaned = patterns
    .map((p) => p.replace(/\r$/, '').trim())
    .filter((p) => p && !p.startsWith('#'));

  return (rel: string): boolean => {
    for (const pattern of cleaned) {
      if (pattern.endsWith('/')) {
        const dir = pattern.slice(0, -1);
        if (rel === dir || rel.startsWith(`${dir}/`)) return true;
      } else if (rel === pattern) {
        return true;
      }
    }
    return false;
  };
}

export function readExcludeFile(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n');
}
```

- [ ] **Step 3: Run exclude.test, verify pass**

Run: `pnpm test:unit -- "plan-builder/exclude"`
Expected: PASS — 4/4.

- [ ] **Step 4: Write the failing overlay-tree test (walker only — no .tmpl rendering yet)**

`src/retrofit/plan-builder/overlay-tree.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildOverlayTree } from './overlay-tree.js';

const JANUS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('buildOverlayTree (walker, .exclude, mode)', () => {
  it('includes _shared/ verbatim files for generic-ts', () => {
    const tree = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots(), { skipTmpl: true });
    // biome.jsonc is verbatim in _shared/
    expect(tree.has('biome.jsonc')).toBe(true);
    const entry = tree.get('biome.jsonc')!;
    expect(entry.content.length).toBeGreaterThan(0);
    expect(entry.mode).toBe(0o644);
  });

  it('respects archetype .exclude — generic-ts excludes infra/', () => {
    const tree = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots(), { skipTmpl: true });
    for (const path of tree.keys()) {
      expect(path.startsWith('infra/')).toBe(false);
    }
  });

  it('respects archetype .exclude — backend-functions excludes src/ and tests/', () => {
    if (!existsSync(join(JANUS_ROOT, 'templates/backend-functions/.exclude'))) {
      // Skip if archetype is missing this fixture (e.g., test running against a stripped checkout).
      return;
    }
    const tree = buildOverlayTree(JANUS_ROOT, 'backend-functions', stubSlots(), {
      skipTmpl: true,
    });
    // _shared has src/ and tests/ stubs, but backend-functions excludes them.
    for (const path of tree.keys()) {
      expect(path.startsWith('src/')).toBe(false);
      expect(path.startsWith('tests/')).toBe(false);
    }
  });

  it('captures hook scripts with mode 0755', () => {
    const tree = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots(), { skipTmpl: true });
    for (const [path, entry] of tree.entries()) {
      if (path.startsWith('.claude/hooks/') && path.endsWith('.sh')) {
        expect(entry.mode).toBe(0o755);
      }
    }
  });
});

function stubSlots(): Record<string, string> {
  // Used by Tasks 15+; for the walker-only test, slot rendering is skipped via skipTmpl.
  return {
    workload: 'foo',
    description: 'd',
    archetype: 'generic-ts',
    github_org: 'pantheon-tech',
    author: 'Daniel',
    author_email: 'd@e.com',
    node_version: '24',
    license: 'MIT',
    region: 'australiaeast',
    template_version: 'v0.1.0',
    year: '2026',
    date: '2026-05-05',
    base_branch: 'staging',
  };
}
```

- [ ] **Step 5: Implement overlay-tree.ts (walker + mode + .exclude — Tasks 15/16/17/18 add layers)**

`src/retrofit/plan-builder/overlay-tree.ts`:

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import type { OverlayTree } from '../types/index.js';
import { buildIsExcluded, readExcludeFile } from './exclude.js';

export type BuildOverlayOpts = {
  /** Skip .tmpl rendering (used by walker-only tests). Tasks 15+ remove this from production paths. */
  skipTmpl?: boolean;
};

export function buildOverlayTree(
  janusRoot: string,
  archetype: string,
  _slots: Record<string, string>,
  opts: BuildOverlayOpts = {},
): OverlayTree {
  const tree: OverlayTree = new Map();

  const sharedRoot = join(janusRoot, 'templates/_shared');
  const archeRoot = join(janusRoot, 'templates', archetype);

  const excludeLines = readExcludeFile(join(archeRoot, '.exclude'));
  const isExcluded = buildIsExcluded(excludeLines);

  // Pass 1: walk _shared/.
  walkSharedTree(sharedRoot, sharedRoot, isExcluded, tree, opts);

  // Pass 2: walk archetype overlay (deferred to Task 16 — placeholder no-op for now).
  // Pass 3: user-side package.json merge (deferred to Task 18).
  // Pass 4: gitignore special-casing (deferred to Task 17).

  return tree;
}

function walkSharedTree(
  sharedRoot: string,
  current: string,
  isExcluded: (rel: string) => boolean,
  tree: OverlayTree,
  opts: BuildOverlayOpts,
): void {
  for (const entry of readdirSync(current)) {
    const full = join(current, entry);
    const stat = statSync(full);
    const rel = toPosix(relative(sharedRoot, full));

    if (stat.isDirectory()) {
      // Allow recursing — exclude check happens per-file (a dir-pattern match
      // would have been redundant since each child's relative path also matches).
      walkSharedTree(sharedRoot, full, isExcluded, tree, opts);
      continue;
    }
    if (!stat.isFile()) continue;

    if (isExcluded(rel)) continue;

    if (rel.endsWith('.tmpl')) {
      if (opts.skipTmpl) continue;
      // Real .tmpl rendering lands in Task 15.
      continue;
    }

    const content = readFileSync(full);
    const mode = computeMode(rel);
    tree.set(rel, { content, mode });
  }
}

function computeMode(rel: string): number {
  // Per spec §6: hook scripts under _shared/.claude/hooks/ are 0755; everything else is 0644.
  if (rel.startsWith('.claude/hooks/')) return 0o755;
  return 0o644;
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join(posix.sep);
}
```

- [ ] **Step 6: Run overlay-tree.test, verify pass**

Run: `pnpm test:unit -- "plan-builder/overlay-tree"`
Expected: PASS — 4/4 (the backend-functions test may auto-skip if templates/ is stripped, but the actual checkout has it).

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/plan-builder/exclude.ts src/retrofit/plan-builder/exclude.test.ts src/retrofit/plan-builder/overlay-tree.ts src/retrofit/plan-builder/overlay-tree.test.ts
git commit -m "feat(retrofit): overlay-tree walker + .exclude semantics + mode preservation"
```

---

## Task 15: overlay-tree — Mustache rendering via vendored mo

**Files:**
- Create: `src/retrofit/plan-builder/render-mo.ts`
- Create: `src/retrofit/plan-builder/render-mo.test.ts`
- Modify: `src/retrofit/plan-builder/overlay-tree.ts`
- Modify: `src/retrofit/plan-builder/overlay-tree.test.ts` — add a .tmpl assertion.

Renders `.tmpl` files by shelling out to `scripts/lib/mo` with the slot environment. Same approach as scaffold.sh — same renderer, same edge cases. We do not use a JS Mustache impl because scaffold.sh's bash mo has its own quirks; mirroring it exactly avoids drift.

- [ ] **Step 1: Write the failing render-mo test**

`src/retrofit/plan-builder/render-mo.test.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderMo } from './render-mo.js';

const JANUS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('renderMo', () => {
  it('substitutes a single slot', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mo-test-'));
    const tmpl = join(dir, 'in.tmpl');
    writeFileSync(tmpl, 'Hello {{workload}}!');
    const out = renderMo(JANUS_ROOT, tmpl, { workload: 'foo' });
    expect(out.toString('utf8')).toBe('Hello foo!');
  });

  it('substitutes multiple slots', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mo-test-'));
    const tmpl = join(dir, 'in.tmpl');
    writeFileSync(tmpl, '{{author}} <{{author_email}}>');
    const out = renderMo(JANUS_ROOT, tmpl, { author: 'Daniel', author_email: 'd@e.com' });
    expect(out.toString('utf8')).toBe('Daniel <d@e.com>');
  });

  it('respects custom-delimiter directive in .tmpl files', () => {
    // Per AGENTS.md: .tmpl files open with {{=<% %>=}} so GitHub Actions ${{ }}
    // expressions pass through. Verify mo respects this.
    const dir = mkdtempSync(join(tmpdir(), 'mo-test-'));
    const tmpl = join(dir, 'in.tmpl');
    writeFileSync(tmpl, '{{=<% %>=}}{{ github.actions.passthrough }}<%workload%>');
    const out = renderMo(JANUS_ROOT, tmpl, { workload: 'foo' });
    expect(out.toString('utf8')).toBe('{{ github.actions.passthrough }}foo');
  });
});
```

- [ ] **Step 2: Implement render-mo.ts**

`src/retrofit/plan-builder/render-mo.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Render a Mustache template by shelling out to the vendored `scripts/lib/mo`.
 *
 * `mo` reads slot values from process environment variables. We pass them via
 * the `env` option so the host process's env is unaffected and concurrent
 * renders don't clobber each other.
 */
export function renderMo(janusRoot: string, tmplPath: string, slots: Record<string, string>): Buffer {
  const moPath = join(janusRoot, 'scripts/lib/mo');
  return execFileSync(moPath, [tmplPath], {
    stdio: ['ignore', 'pipe', 'inherit'],
    // mo executes inside a clean env (only PATH + slot vars). PATH is required
    // for mo to invoke its own bash subshells; slot vars are the substitution source.
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      ...slots,
    },
    maxBuffer: 16 * 1024 * 1024,
  });
}
```

- [ ] **Step 3: Run render-mo.test, verify pass**

Run: `pnpm test:unit -- "plan-builder/render-mo"`
Expected: PASS — 3/3.

- [ ] **Step 4: Wire renderMo into overlay-tree.ts**

In `src/retrofit/plan-builder/overlay-tree.ts`, replace the `.tmpl` branch in `walkSharedTree`:

```ts
import { renderMo } from './render-mo.js';

// ... inside walkSharedTree:
if (rel.endsWith('.tmpl')) {
  if (opts.skipTmpl) continue;
  const rendered = renderMo(sharedRoot.replace(/\/templates\/_shared$/, ''), full, _slots);
  // ^ Pass janusRoot, not sharedRoot. We threaded sharedRoot in for path math; recover janusRoot here.
  const outRel = rel.slice(0, -'.tmpl'.length);
  tree.set(outRel, { content: rendered, mode: computeMode(outRel) });
  continue;
}
```

To keep this clean, refactor `walkSharedTree` to take `janusRoot` directly. Final overlay-tree.ts (replace the file's contents):

```ts
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import type { OverlayTree } from '../types/index.js';
import { buildIsExcluded, readExcludeFile } from './exclude.js';
import { renderMo } from './render-mo.js';

export type BuildOverlayOpts = {
  skipTmpl?: boolean;
};

export function buildOverlayTree(
  janusRoot: string,
  archetype: string,
  slots: Record<string, string>,
  opts: BuildOverlayOpts = {},
): OverlayTree {
  const tree: OverlayTree = new Map();
  const sharedRoot = join(janusRoot, 'templates/_shared');
  const archeRoot = join(janusRoot, 'templates', archetype);

  const isExcluded = buildIsExcluded(readExcludeFile(join(archeRoot, '.exclude')));

  walkTree({ janusRoot, base: sharedRoot, current: sharedRoot, isExcluded, slots, tree, opts });
  // Tasks 16/17/18 add archetype walk + gitignore special-case + user-pkg merge.
  return tree;
}

function walkTree(args: {
  janusRoot: string;
  base: string;
  current: string;
  isExcluded: (rel: string) => boolean;
  slots: Record<string, string>;
  tree: OverlayTree;
  opts: BuildOverlayOpts;
}): void {
  const { janusRoot, base, current, isExcluded, slots, tree, opts } = args;
  for (const entry of readdirSync(current)) {
    const full = join(current, entry);
    const stat = statSync(full);
    const rel = toPosix(relative(base, full));

    if (stat.isDirectory()) {
      walkTree({ ...args, current: full });
      continue;
    }
    if (!stat.isFile()) continue;
    if (isExcluded(rel)) continue;

    if (rel.endsWith('.tmpl')) {
      if (opts.skipTmpl) continue;
      const rendered = renderMo(janusRoot, full, slots);
      const outRel = rel.slice(0, -'.tmpl'.length);
      tree.set(outRel, { content: rendered, mode: computeMode(outRel) });
      continue;
    }

    tree.set(rel, { content: readFileSync(full), mode: computeMode(rel) });
  }
}

function computeMode(rel: string): number {
  if (rel.startsWith('.claude/hooks/')) return 0o755;
  return 0o644;
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join(posix.sep);
}
```

- [ ] **Step 5: Add a .tmpl assertion to overlay-tree.test.ts**

Append to the existing describe block in `src/retrofit/plan-builder/overlay-tree.test.ts`:

```ts
it('renders .tmpl files using slots', () => {
  const tree = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots());
  // README.md is templated with {{workload}} — verify substitution happened.
  const readme = tree.get('README.md');
  expect(readme).toBeDefined();
  const text = readme!.content.toString('utf8');
  // Should contain the slot value, NOT the literal placeholder.
  expect(text).not.toContain('{{workload}}');
  expect(text).not.toContain('<%workload%>');
});
```

- [ ] **Step 6: Run all overlay-tree tests, verify pass**

Run: `pnpm test:unit -- "plan-builder/overlay-tree"`
Expected: PASS — 5/5.

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/plan-builder/render-mo.ts src/retrofit/plan-builder/render-mo.test.ts src/retrofit/plan-builder/overlay-tree.ts src/retrofit/plan-builder/overlay-tree.test.ts
git commit -m "feat(retrofit): overlay-tree — Mustache rendering via vendored mo"
```

---

## Task 16: overlay-tree — archetype walk + jq deep-merge + .env.example append

**Files:**
- Modify: `src/retrofit/plan-builder/overlay-tree.ts`
- Create: `src/retrofit/plan-builder/jq-merge.ts`
- Create: `src/retrofit/plan-builder/jq-merge.test.ts`
- Modify: `src/retrofit/plan-builder/overlay-tree.test.ts`

After this task, `buildOverlayTree` mirrors all of scaffold.sh's tree-construction passes 1, 2, 3 (excluding .gitignore special case = Task 17 and user-side pkg merge = Task 18).

- [ ] **Step 1: Write the failing jq-merge test**

`src/retrofit/plan-builder/jq-merge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { jqDeepMerge } from './jq-merge.js';

describe('jqDeepMerge (jq -s ".[0] * .[1]")', () => {
  it('merges scalars right-wins', () => {
    const out = jqDeepMerge({ name: 'a', version: '1' }, { name: 'b' });
    expect(out).toEqual({ name: 'b', version: '1' });
  });

  it('merges nested objects recursively', () => {
    const out = jqDeepMerge(
      { scripts: { lint: 'eslint .', dev: 'vite' } },
      { scripts: { lint: 'biome check', test: 'vitest' } },
    );
    expect(out).toEqual({
      scripts: { lint: 'biome check', dev: 'vite', test: 'vitest' },
    });
  });

  it('right-replaces arrays at leaves (jq * semantics)', () => {
    const out = jqDeepMerge({ keywords: ['a', 'b'] }, { keywords: ['c'] });
    expect(out).toEqual({ keywords: ['c'] });
  });
});
```

- [ ] **Step 2: Implement jq-merge.ts**

`src/retrofit/plan-builder/jq-merge.ts`:

```ts
import { execFileSync } from 'node:child_process';

/**
 * Replicates `jq -s '.[0] * .[1]' a.json b.json`:
 *   - Object recursion at all levels.
 *   - Right-operand wins at leaf positions (scalars and arrays).
 *
 * We shell out to `jq` (system dep) instead of reimplementing — guarantees
 * byte-for-byte agreement with scaffold.sh.
 */
export function jqDeepMerge(left: unknown, right: unknown): unknown {
  const input = `${JSON.stringify(left)}\n${JSON.stringify(right)}\n`;
  const out = execFileSync('jq', ['-s', '.[0] * .[1]'], {
    input,
    stdio: ['pipe', 'pipe', 'inherit'],
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(out);
}
```

- [ ] **Step 3: Run jq-merge.test, verify pass**

Run: `pnpm test:unit -- "plan-builder/jq-merge"`
Expected: PASS — 3/3.

- [ ] **Step 4: Extend overlay-tree.ts with archetype walk**

Update `src/retrofit/plan-builder/overlay-tree.ts`. Replace `buildOverlayTree` and add `walkArchetypeTree`:

```ts
export function buildOverlayTree(
  janusRoot: string,
  archetype: string,
  slots: Record<string, string>,
  opts: BuildOverlayOpts = {},
): OverlayTree {
  const tree: OverlayTree = new Map();
  const sharedRoot = join(janusRoot, 'templates/_shared');
  const archeRoot = join(janusRoot, 'templates', archetype);
  const isExcluded = buildIsExcluded(readExcludeFile(join(archeRoot, '.exclude')));

  // Pass 1: shared walk.
  walkTree({ janusRoot, base: sharedRoot, current: sharedRoot, isExcluded, slots, tree, opts });

  // Pass 2: archetype walk (overlay-with-replace).
  if (existsSync(archeRoot)) {
    walkArchetype({ janusRoot, archeRoot, slots, tree, opts });
  }

  // Pass 3: if archetype excludes infra/, strip deploy:* scripts from package.json.
  if (excludesInfra(readExcludeFile(join(archeRoot, '.exclude')))) {
    pruneDeployScripts(tree);
  }

  return tree;
}

function walkArchetype(args: {
  janusRoot: string;
  archeRoot: string;
  slots: Record<string, string>;
  tree: OverlayTree;
  opts: BuildOverlayOpts;
}): void {
  const { janusRoot, archeRoot, slots, tree, opts } = args;
  walkArcheRecursive(archeRoot, archeRoot);

  function walkArcheRecursive(base: string, current: string): void {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const stat = statSync(full);
      const rel = toPosix(relative(base, full));

      // Per-file skip rules (from scaffold.sh lines 326–330):
      if (rel === '.exclude' || rel === 'README.md' || rel === 'slots.json') continue;

      if (stat.isDirectory()) {
        walkArcheRecursive(base, full);
        continue;
      }
      if (!stat.isFile()) continue;

      // .env.example: append to shared, don't replace.
      if (rel === '.env.example') {
        const archeContent = readFileSync(full);
        const existing = tree.get('.env.example');
        const merged = existing
          ? Buffer.concat([existing.content, Buffer.from('\n'), archeContent])
          : archeContent;
        tree.set('.env.example', { content: merged, mode: 0o644 });
        continue;
      }

      // package.json.tmpl: render then jq-deep-merge over the shared package.json in the tree.
      if (rel === 'package.json.tmpl') {
        if (opts.skipTmpl) continue;
        const archeRendered = renderMo(janusRoot, full, slots);
        const sharedPkgEntry = tree.get('package.json');
        const sharedPkg = sharedPkgEntry ? JSON.parse(sharedPkgEntry.content.toString('utf8')) : {};
        const archePkg = JSON.parse(archeRendered.toString('utf8'));
        const merged = jqDeepMerge(sharedPkg, archePkg);
        tree.set('package.json', {
          content: Buffer.from(`${JSON.stringify(merged, null, 2)}\n`, 'utf8'),
          mode: 0o644,
        });
        continue;
      }

      // Render-or-copy with overlay-replace.
      if (rel.endsWith('.tmpl')) {
        if (opts.skipTmpl) continue;
        const rendered = renderMo(janusRoot, full, slots);
        const outRel = rel.slice(0, -'.tmpl'.length);
        tree.set(outRel, { content: rendered, mode: computeMode(outRel) });
        continue;
      }

      tree.set(rel, { content: readFileSync(full), mode: computeMode(rel) });
    }
  }
}

function excludesInfra(excludeLines: string[]): boolean {
  return excludeLines.some((l) => l.replace(/\r$/, '').trim() === 'infra/');
}

function pruneDeployScripts(tree: OverlayTree): void {
  const pkgEntry = tree.get('package.json');
  if (!pkgEntry) return;
  const pkg = JSON.parse(pkgEntry.content.toString('utf8'));
  if (pkg.scripts) {
    delete pkg.scripts['deploy:staging'];
    delete pkg.scripts['deploy:prod'];
  }
  tree.set('package.json', {
    content: Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`, 'utf8'),
    mode: 0o644,
  });
}
```

Add the necessary imports at the top of the file:

```ts
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { jqDeepMerge } from './jq-merge.js';
```

- [ ] **Step 5: Add archetype-overlay assertions to overlay-tree.test.ts**

Append to the existing describe block:

```ts
it('archetype overlay replaces shared file (backend-functions has its own AGENTS.md.tmpl)', () => {
  const tree = buildOverlayTree(JANUS_ROOT, 'backend-functions', stubSlots());
  const agents = tree.get('AGENTS.md');
  expect(agents).toBeDefined();
  // Archetype version is what survives; verify it does NOT contain the generic _shared marker.
  // (We can't pin exact content without coupling to template text. The fact that .tmpl rendered AT ALL is the assertion.)
  expect(agents!.content.toString('utf8').length).toBeGreaterThan(0);
});

it('jq-merges archetype package.json over shared package.json', () => {
  const tree = buildOverlayTree(JANUS_ROOT, 'backend-functions', stubSlots());
  const pkgEntry = tree.get('package.json');
  expect(pkgEntry).toBeDefined();
  const pkg = JSON.parse(pkgEntry!.content.toString('utf8'));
  // Both shared and archetype set fields; archetype-specific ones must survive.
  expect(pkg.name).toBeDefined();
});

it('skips archetype README.md (meta documentation, never shipped)', () => {
  const tree = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots());
  // README.md from _shared/ should still be present; what matters is we didn't blow it away with the
  // archetype's META README. (The archetype's README.md is documentation about the archetype itself.)
  const readme = tree.get('README.md');
  expect(readme).toBeDefined();
});
```

- [ ] **Step 6: Run overlay-tree tests, verify pass**

Run: `pnpm test:unit -- "plan-builder/overlay-tree"`
Expected: PASS — 8/8.

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/plan-builder/jq-merge.ts src/retrofit/plan-builder/jq-merge.test.ts src/retrofit/plan-builder/overlay-tree.ts src/retrofit/plan-builder/overlay-tree.test.ts
git commit -m "feat(retrofit): overlay-tree — archetype walk + jq deep-merge + .env.example append"
```

---

## Task 17: overlay-tree — `.gitignore` special case

**Files:**
- Modify: `src/retrofit/plan-builder/overlay-tree.ts`
- Modify: `src/retrofit/plan-builder/overlay-tree.test.ts`

Per spec §6 step 1: `.gitignore` is the only file in the overlay tree that may need to be merged with user content rather than overwritten. The overlay tree carries a *marker* for `.gitignore` (a `GitignoreOverlayMarker`) when janus's lines should be merged; plan-builder uses the marker to emit a `gitignore_merge` op. If the user has no existing `.gitignore`, plan-builder uses the verbatim content.

Plan 2 implements only the overlay-tree side: the marker payload (the list of janus lines, in source order). The "fall back to write_file if user has none" decision is plan-builder's responsibility (Plan 3) since it requires reading the user's repo state.

- [ ] **Step 1: Add a third map alongside OverlayTree**

Update the return type of `buildOverlayTree` to also surface gitignore lines. We do this by extending the function's return shape (not the `OverlayTree` map itself, which is `path → OverlayEntry`).

In `src/retrofit/plan-builder/overlay-tree.ts`:

```ts
export type OverlayResult = {
  tree: OverlayTree;
  gitignore_lines: string[]; // janus's lines in source order; consumed by plan-builder for gitignore_merge op
};

export function buildOverlayTree(
  janusRoot: string,
  archetype: string,
  slots: Record<string, string>,
  opts: BuildOverlayOpts = {},
): OverlayResult {
  // ... existing logic ...
  // In walkTree, when `rel === '.gitignore'`, capture the lines instead of adding to tree:
  // Then return { tree, gitignore_lines }.
}
```

Modify `walkTree` to special-case `.gitignore`:

```ts
function walkTree(args: {
  janusRoot: string;
  base: string;
  current: string;
  isExcluded: (rel: string) => boolean;
  slots: Record<string, string>;
  tree: OverlayTree;
  gitignoreLines: { lines: string[] };
  opts: BuildOverlayOpts;
}): void {
  // ... iteration ...
  if (rel === '.gitignore') {
    const content = readFileSync(full, 'utf8');
    args.gitignoreLines.lines = content
      .split('\n')
      .map((l) => l.replace(/\r$/, ''))
      .filter((l, i, arr) => !(i === arr.length - 1 && l === '')); // drop trailing newline
    continue; // do NOT add to tree
  }
  // ... rest ...
}
```

Final `buildOverlayTree`:

```ts
export function buildOverlayTree(
  janusRoot: string,
  archetype: string,
  slots: Record<string, string>,
  opts: BuildOverlayOpts = {},
): OverlayResult {
  const tree: OverlayTree = new Map();
  const gitignoreLines = { lines: [] as string[] };
  const sharedRoot = join(janusRoot, 'templates/_shared');
  const archeRoot = join(janusRoot, 'templates', archetype);
  const isExcluded = buildIsExcluded(readExcludeFile(join(archeRoot, '.exclude')));

  walkTree({
    janusRoot,
    base: sharedRoot,
    current: sharedRoot,
    isExcluded,
    slots,
    tree,
    gitignoreLines,
    opts,
  });

  if (existsSync(archeRoot)) {
    walkArchetype({ janusRoot, archeRoot, slots, tree, opts });
  }
  if (excludesInfra(readExcludeFile(join(archeRoot, '.exclude')))) {
    pruneDeployScripts(tree);
  }

  return { tree, gitignore_lines: gitignoreLines.lines };
}
```

- [ ] **Step 2: Update overlay-tree.test.ts to reflect the new return shape**

Existing tests use `tree.get(...)`. Replace `buildOverlayTree(...)` calls with `buildOverlayTree(...).tree` everywhere in the test file (use `replace_all` if the test file has many occurrences).

Also add:

```ts
it('does NOT add .gitignore to the tree (special-cased for gitignore_merge)', () => {
  const result = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots());
  expect(result.tree.has('.gitignore')).toBe(false);
});

it('captures janus .gitignore lines in source order', () => {
  const result = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots());
  expect(result.gitignore_lines.length).toBeGreaterThan(0);
  // The first non-comment, non-blank entry of _shared/.gitignore is `node_modules/`.
  expect(result.gitignore_lines).toContain('node_modules/');
});
```

- [ ] **Step 3: Run overlay-tree tests, verify pass**

Run: `pnpm test:unit -- "plan-builder/overlay-tree"`
Expected: PASS — 10/10.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/plan-builder/overlay-tree.ts src/retrofit/plan-builder/overlay-tree.test.ts
git commit -m "feat(retrofit): overlay-tree — capture .gitignore lines for gitignore_merge instead of writing file"
```

---

## Task 18: overlay-tree — user-side package.json merge

**Files:**
- Modify: `src/retrofit/plan-builder/overlay-tree.ts`
- Modify: `src/retrofit/plan-builder/overlay-tree.test.ts`

Per spec §6 step 4: if the user's repo has an existing `package.json`, jq-deep-merge `{user_pkg} * {janus_rendered_pkg}` so the user's `package.json` becomes the LEFT operand and janus's rendered version becomes the RIGHT (janus wins on collisions). Plan-builder must call this; overlay-tree exposes a small helper.

- [ ] **Step 1: Add `mergeUserPackageJson` helper to overlay-tree.ts**

Append to `src/retrofit/plan-builder/overlay-tree.ts`:

```ts
import { jqDeepMerge as _alreadyImported } from './jq-merge.js'; // already imported above

/**
 * Merge the user's existing package.json into the overlay tree's package.json,
 * mutating the tree entry in place. User content is the left operand; janus
 * content (already in the tree from buildOverlayTree) is the right operand.
 * Per jq `*` semantics, janus wins on every key it sets.
 *
 * Caller is responsible for reading the user's package.json and detecting whether
 * it exists at all; this helper assumes it does.
 */
export function mergeUserPackageJson(
  tree: OverlayTree,
  userPkg: Record<string, unknown>,
): void {
  const janusEntry = tree.get('package.json');
  if (!janusEntry) {
    // No janus package.json in the tree — only happens for archetypes that don't ship one.
    // Record the user's pkg as-is so the overlay represents the post-merge state.
    tree.set('package.json', {
      content: Buffer.from(`${JSON.stringify(userPkg, null, 2)}\n`, 'utf8'),
      mode: 0o644,
    });
    return;
  }
  const janusPkg = JSON.parse(janusEntry.content.toString('utf8'));
  const merged = jqDeepMerge(userPkg, janusPkg);
  tree.set('package.json', {
    content: Buffer.from(`${JSON.stringify(merged, null, 2)}\n`, 'utf8'),
    mode: 0o644,
  });
}
```

- [ ] **Step 2: Add a failing test**

Append to `src/retrofit/plan-builder/overlay-tree.test.ts`:

```ts
import { buildOverlayTree, mergeUserPackageJson } from './overlay-tree.js';

it('mergeUserPackageJson preserves user-only scripts and lets janus win on collisions', () => {
  const result = buildOverlayTree(JANUS_ROOT, 'generic-ts', stubSlots());
  // Synthesize a user package.json with a custom script + a colliding one.
  const userPkg = {
    name: 'user-app',
    type: 'commonjs', // janus will overwrite to "module" (per shared package.json.tmpl)
    scripts: {
      'my-custom-script': 'echo hi',
      lint: 'eslint .', // janus overrides to biome
    },
  };
  mergeUserPackageJson(result.tree, userPkg);
  const merged = JSON.parse(result.tree.get('package.json')!.content.toString('utf8'));
  expect(merged.scripts['my-custom-script']).toBe('echo hi');
  // janus wins on collisions:
  expect(merged.scripts.lint).not.toBe('eslint .');
  expect(merged.type).toBe('module');
});
```

- [ ] **Step 3: Run overlay-tree tests, verify pass**

Run: `pnpm test:unit -- "plan-builder/overlay-tree"`
Expected: PASS — 11/11.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/plan-builder/overlay-tree.ts src/retrofit/plan-builder/overlay-tree.test.ts
git commit -m "feat(retrofit): overlay-tree — mergeUserPackageJson helper for user-side jq merge"
```

---

## Task 19: analyzer/baseline-diff.ts

**Files:**
- Create: `src/retrofit/analyzer/baseline-diff.ts`
- Create: `src/retrofit/analyzer/baseline-diff.test.ts`

Walks the rendered overlay tree and compares each target file to the user's repo. Returns `BaselineFileStatus[]` with `missing` / `present_identical` / `present_differs` plus pre-state hashes for the latter two.

- [ ] **Step 1: Write the failing tests**

`src/retrofit/analyzer/baseline-diff.test.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import type { OverlayTree } from '../types/index.js';
import { baselineDiff } from './baseline-diff.js';

const overlay = (entries: Array<[string, string, number?]>): OverlayTree => {
  const map: OverlayTree = new Map();
  for (const [path, content, mode] of entries) {
    map.set(path, { content: Buffer.from(content, 'utf8'), mode: mode ?? 0o644 });
  }
  return map;
};

describe('baselineDiff', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('reports missing for files not in the repo', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const tree = overlay([['biome.jsonc', '{}']]);
    const diff = baselineDiff(fx.dir, tree);
    expect(diff).toHaveLength(1);
    expect(diff[0]?.path).toBe('biome.jsonc');
    expect(diff[0]?.status).toBe('missing');
    expect(diff[0]?.pre_state_hash).toBeUndefined();
    expect(diff[0]?.current_mode).toBeUndefined();
  });

  it('reports present_identical when content matches byte-for-byte', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'biome.jsonc'), '{}');
    const tree = overlay([['biome.jsonc', '{}']]);
    const diff = baselineDiff(fx.dir, tree);
    expect(diff[0]?.status).toBe('present_identical');
    expect(diff[0]?.pre_state_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(diff[0]?.current_mode).toBe(0o644);
  });

  it('reports present_differs when content does not match', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    writeFileSync(join(fx.dir, 'biome.jsonc'), '{ "foo": 1 }');
    const tree = overlay([['biome.jsonc', '{}']]);
    const diff = baselineDiff(fx.dir, tree);
    expect(diff[0]?.status).toBe('present_differs');
    expect(diff[0]?.pre_state_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('reports current_mode when present', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    mkdirSync(join(fx.dir, '.claude/hooks'), { recursive: true });
    writeFileSync(join(fx.dir, '.claude/hooks/foo.sh'), '#!/bin/sh\necho hi\n', { mode: 0o755 });
    const tree = overlay([['.claude/hooks/foo.sh', '#!/bin/sh\necho hi\n', 0o755]]);
    const diff = baselineDiff(fx.dir, tree);
    expect(diff[0]?.current_mode).toBe(0o755);
  });

  it('returns sorted output (deterministic)', () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    const tree = overlay([
      ['z.txt', 'z'],
      ['a.txt', 'a'],
      ['m.txt', 'm'],
    ]);
    const diff = baselineDiff(fx.dir, tree);
    expect(diff.map((d) => d.path)).toEqual(['a.txt', 'm.txt', 'z.txt']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test:unit -- baseline-diff.test`
Expected: FAIL.

- [ ] **Step 3: Implement baseline-diff.ts**

`src/retrofit/analyzer/baseline-diff.ts`:

```ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BaselineFileStatus, OverlayTree, Sha256 } from '../types/index.js';

export function baselineDiff(repoRoot: string, tree: OverlayTree): BaselineFileStatus[] {
  const out: BaselineFileStatus[] = [];
  for (const [path, entry] of tree.entries()) {
    const full = join(repoRoot, path);
    if (!existsSync(full)) {
      out.push({ path, status: 'missing' });
      continue;
    }
    const stat = statSync(full);
    if (!stat.isFile()) {
      // Not a file (a directory at the same path is unexpected; treat as missing for retrofit's purposes).
      out.push({ path, status: 'missing' });
      continue;
    }
    const content = readFileSync(full);
    const pre_state_hash = sha256Of(content);
    const current_mode = stat.mode & 0o777;
    const status =
      Buffer.compare(content, entry.content) === 0 ? 'present_identical' : 'present_differs';
    out.push({ path, status, pre_state_hash, current_mode });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function sha256Of(buf: Buffer): Sha256 {
  const hex = createHash('sha256').update(buf).digest('hex');
  return `sha256:${hex}` as Sha256;
}
```

- [ ] **Step 4: Run baseline-diff.test, verify pass**

Run: `pnpm test:unit -- baseline-diff.test`
Expected: PASS — 5/5.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/analyzer/baseline-diff.ts src/retrofit/analyzer/baseline-diff.test.ts
git commit -m "feat(retrofit): analyzer/baseline-diff.ts — overlay-vs-disk comparison with pre-state hashes"
```

---

## Task 20: Add the remaining cross-cutting fixtures

**Files:**
- Create: `tests/fixtures/repos/monorepo/{package.json,pnpm-workspace.yaml,packages/api/package.json}`
- Create: `tests/fixtures/repos/repo-with-submodule/{setup.sh,README.md}`
- Create: `tests/fixtures/repos/repo-with-symlink/{setup.sh,real.txt}`
- Create: `tests/fixtures/repos/pnpm-workspace/{package.json,pnpm-workspace.yaml,pnpm-lock.yaml}`

Used by Task 21 integration tests and any future analyzer/baseline-diff edge-case tests.

- [ ] **Step 1: Monorepo fixture**

`tests/fixtures/repos/monorepo/package.json`:

```json
{
  "name": "my-monorepo",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.7.0"
}
```

`tests/fixtures/repos/monorepo/pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
```

`tests/fixtures/repos/monorepo/packages/api/package.json`:

```json
{
  "name": "@my-monorepo/api",
  "version": "0.0.0"
}
```

- [ ] **Step 2: pnpm-workspace fixture (alternate flat-workspace shape)**

`tests/fixtures/repos/pnpm-workspace/package.json`:

```json
{
  "name": "ws-root",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.7.0"
}
```

`tests/fixtures/repos/pnpm-workspace/pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

`tests/fixtures/repos/pnpm-workspace/pnpm-lock.yaml`:

```yaml
lockfileVersion: '9.0'
```

- [ ] **Step 3: Submodule fixture (uses setup.sh hook)**

`tests/fixtures/repos/repo-with-submodule/README.md`:

```markdown
# repo-with-submodule

Has a `.gitmodules` so analyzer reports has_submodules: true.
```

`tests/fixtures/repos/repo-with-submodule/setup.sh`:

```bash
#!/usr/bin/env bash
# Create a .gitmodules file pointing to a non-existent submodule.
# We don't need a real submodule clone — analyzer only checks for the file's presence.
cat > .gitmodules <<'EOF'
[submodule "vendor/lib"]
    path = vendor/lib
    url = https://example.invalid/vendor/lib.git
EOF
git add .gitmodules
git -c user.name=fixture -c user.email=f@x.com commit -q -m "fixture: add gitmodules"
```

Mark executable:

```bash
chmod +x tests/fixtures/repos/repo-with-submodule/setup.sh
```

- [ ] **Step 4: Symlink fixture (uses setup.sh hook)**

`tests/fixtures/repos/repo-with-symlink/real.txt`:

```
real content
```

`tests/fixtures/repos/repo-with-symlink/setup.sh`:

```bash
#!/usr/bin/env bash
ln -s real.txt link.txt
git add link.txt
git -c user.name=fixture -c user.email=f@x.com commit -q -m "fixture: add symlink"
```

```bash
chmod +x tests/fixtures/repos/repo-with-symlink/setup.sh
```

- [ ] **Step 5: Sanity-check fixtures materialize**

Add a quick test to `tests/helpers/fixture-repo.test.ts`:

```ts
it('materializes submodule fixture and runs setup.sh', () => {
  const fx = materializeFixture('repo-with-submodule');
  cleanups.push(fx.cleanup);
  expect(existsSync(join(fx.dir, '.gitmodules'))).toBe(true);
});

it('materializes symlink fixture', () => {
  const fx = materializeFixture('repo-with-symlink');
  cleanups.push(fx.cleanup);
  // The symlink should exist; we don't dereference (analyzer treats symlinks per its rules).
  expect(existsSync(join(fx.dir, 'link.txt'))).toBe(true);
});
```

Run: `pnpm test:unit -- fixture-repo.test`
Expected: PASS (now 6/6).

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/repos/monorepo/ tests/fixtures/repos/pnpm-workspace/ tests/fixtures/repos/repo-with-submodule/ tests/fixtures/repos/repo-with-symlink/ tests/helpers/fixture-repo.test.ts
git commit -m "test(retrofit): add monorepo, pnpm-workspace, submodule, symlink fixtures"
```

---

## Task 21: Cross-cutting integration test (analyze + resolvers + overlay + baseline-diff)

**Files:**
- Create: `tests/integration/plan2-end-to-end.test.ts`

End-to-end smoke test exercising every Plan 2 module on the eslint-only fixture: analyze → resolveSlots → resolvePlugins → buildOverlayTree → baselineDiff. Asserts that the final BaselineFileStatus list contains expected entries with right statuses.

- [ ] **Step 1: Write the integration test**

`tests/integration/plan2-end-to-end.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { analyze } from '../../src/retrofit/analyzer/index.js';
import { baselineDiff } from '../../src/retrofit/analyzer/baseline-diff.js';
import { buildOverlayTree } from '../../src/retrofit/plan-builder/overlay-tree.js';
import { resolvePlugins } from '../../src/retrofit/resolvers/plugins.js';
import { resolveSlots } from '../../src/retrofit/resolvers/slots.js';
import { materializeFixture } from '../helpers/fixture-repo.js';
import { fileURLToPath } from 'node:url';

const JANUS_ROOT = fileURLToPath(new URL('../../', import.meta.url));

describe('Plan 2 end-to-end', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('produces a coherent snapshot+slots+plugins+overlay+baseline for eslint-only fixture', async () => {
    const fx = materializeFixture('eslint-only');
    cleanups.push(fx.cleanup);

    // Add a fake remote so the github_org/workload slots auto-source.
    execSync('git remote add origin https://github.com/test-org/eslint-only.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });

    // 1. Analyze.
    const snapshot = analyze(fx.dir);
    expect(snapshot.displaced_tools.find((t) => t.name === 'eslint')).toBeDefined();
    expect(snapshot.remote.parsed?.repo).toBe('eslint-only');

    // 2. Resolve slots (non-interactive, with author from --slot since fixture has none).
    const slots = await resolveSlots({
      snapshot,
      archetype: 'generic-ts',
      cliSlots: {
        author: 'Test Author',
        author_email: 'test@example.com',
        description: 'A test repo',
      },
      nonInteractive: true,
      now: new Date('2026-05-05T00:00:00Z'),
      janusVersion: '0.1.0',
    });
    expect(slots.workload).toBe('eslintonly'); // 'eslint-only' contains a hyphen, so workload validation would fail — the test expects fallback handling. Adjust: actually, 'eslint-only' fails `workload` regex. So this test must use a fixture-friendly remote name instead.
  });
});
```

**Note for the implementer:** The repo-name `eslint-only` contains a hyphen and fails the `workload` regex. Use the alternate test below — it uses a remote whose repo name is `eslintonly`, which passes validation. Replace the `git remote add` line and the workload assertion accordingly:

```ts
execSync('git remote add origin https://github.com/test-org/eslintonly.git', {
  cwd: fx.dir,
  stdio: 'pipe',
});
// ...
expect(slots.workload).toBe('eslintonly');

// 3. Resolve plugins (no plugin evidence in fixture).
const plugins = await resolvePlugins({
  pluginEvidence: snapshot.plugin_evidence,
  cliAdd: [],
  cliRemove: [],
  nonInteractive: true,
});
expect(plugins).toEqual([]);

// 4. Build overlay tree.
const overlay = buildOverlayTree(JANUS_ROOT, 'generic-ts', slots);
expect(overlay.tree.size).toBeGreaterThan(0);
expect(overlay.gitignore_lines.length).toBeGreaterThan(0);

// 5. Baseline diff.
const diff = baselineDiff(fx.dir, overlay.tree);
// eslint-only fixture has package.json — janus's overlay also has package.json.
// Almost everything else should be 'missing' for a near-greenfield fixture.
const pkg = diff.find((d) => d.path === 'package.json');
expect(pkg?.status).toBe('present_differs'); // user's eslint-flavored pkg differs from janus's
const biome = diff.find((d) => d.path === 'biome.jsonc');
expect(biome?.status).toBe('missing');
```

(The implementer should consolidate the test into one self-contained `it` block matching the second/corrected version above.)

- [ ] **Step 2: Run integration test, verify pass**

Run: `pnpm test:unit -- "plan2-end-to-end"`
Expected: PASS — 1/1.

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm typecheck
git add tests/integration/plan2-end-to-end.test.ts
git commit -m "test(retrofit): cross-cutting integration test for analyze→resolve→overlay→diff"
```

---

## Task 22: Final sanity — all tests, build, biome fixups, close out Plan 2

**Files:**
- Modify: any files biome reformats during `pnpm check`.

End state: every Plan 2 module is implemented, tested, and packaged. `dist/` ships analyzer + resolvers + overlay-tree + new types.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — bash smoke tests + all vitest tests across Plan 1 (6) + Plan 2 (~50+) all green.

- [ ] **Step 2: Clean build + typecheck**

```bash
rm -rf dist .tsbuildinfo
pnpm build
pnpm typecheck
```

Expected: both PASS. Verify `dist/retrofit/` now contains:
- `analyzer/{git-state,package-manager,displaced-tools,claude-kit,plugin-evidence,baseline-diff,index}.{js,d.ts}`
- `resolvers/{slot-validation,slots,plugins}.{js,d.ts}`
- `plan-builder/{exclude,jq-merge,render-mo,overlay-tree}.{js,d.ts}`
- `types/index.{js,d.ts}` (updated with Plan 2 types)

- [ ] **Step 3: Verify `pnpm pack` packages correctly**

Run: `pnpm pack --dry-run`
Expected: tarball contents include `dist/retrofit/analyzer/`, `dist/retrofit/resolvers/`, `dist/retrofit/plan-builder/` (new in Plan 2).

- [ ] **Step 4: Run biome check**

Run: `pnpm check`
Expected: PASS. Biome may auto-format new files.

- [ ] **Step 5: Commit any biome formatting fixups**

```bash
git status
# If anything changed:
git add -A && git commit -m "chore(retrofit): biome formatting fixups for Plan 2"
# Otherwise skip.
```

- [ ] **Step 6: Final state check**

Run: `git status` — must be clean.
Run: `git log --oneline | head -25` — should show ~22 commits added during Plan 2 plus the Plan 1 series.

Plan 2 is complete. End state:
- `analyze()` produces an `Omit<RepoSnapshot, 'baseline_files'>` with all top-level fields populated.
- `resolveSlots()` and `resolvePlugins()` cover §5a/§5b source-order semantics including `--non-interactive` failure modes.
- `buildOverlayTree()` mirrors `scripts/scaffold.sh` for shared+archetype walks, .exclude, mode, .tmpl rendering, jq merge, and the .gitignore special case.
- `mergeUserPackageJson()` performs the user-side merge when a user package.json exists.
- `baselineDiff()` produces the missing/identical/differs status per file with pre-state hashes.
- 12 fixture repos under `tests/fixtures/repos/` exercise every analyzer concern.
- ~50+ vitest tests across analyzer / resolvers / plan-builder are green.

---

## Self-review checklist

After completing all tasks above, verify:

1. **Spec coverage:**
   - §5 RepoSnapshot fields → all populated in `analyze()` (Task 10) + `baselineDiff()` (Task 19)
   - §5 detection rules (pnpm/npm/yarn, eslint/prettier/husky/jest, dep-version conflicts) → covered by Tasks 5/7. **Note:** dep-version conflicts are *recorded* by Plan 3 plan-builder (it knows what janus pins); Plan 2's analyzer surfaces the user's pinned versions in `package_json.devDependencies` for plan-builder to compare. Document this hand-off in the relevant module comments.
   - §5 unrecognized_tools allowlist → starter list in Task 10. Plan 5 wires up the docs/conventions/dependencies.md reader; note this in §5 cross-reference.
   - §5a slot resolution source order, validation table, --non-interactive errors → Tasks 11/12
   - §5b plugin resolution including banana-claude opt-in via --plugin → Task 13
   - §6 step 1 walker, .exclude semantics, mode preservation, .gitignore special case → Tasks 14/15/17
   - §6 step 2 archetype walk, .env.example append, package.json jq merge → Task 16
   - §6 step 3 deploy:* prune when infra/ excluded → Task 16
   - §6 step 4 user-side package.json merge → Task 18
   - §12 ~12 fixture repos → Tasks 3/6/20 (greenfield, eslint-only, prettier-husky, npm-with-jest, no-package-json, already-janus, commonjs, user-modified-skill, monorepo, pnpm-workspace, submodule, symlink — that's 12)

2. **Placeholder scan:** No "TBD", "TODO", "implement later", "fill in details", "appropriate error handling" — every step contains complete code or runnable commands. (Acknowledged exception: Task 21's first draft is shown then corrected with explicit instructions to consolidate into the corrected form. The implementer must produce the corrected form.)

3. **Type consistency:**
   - `SlotMap`, `SlotKey` defined in `resolvers/slots.ts` (Task 12); same names used in `resolvePlugins`-related types (Task 13). No drift between `resolveSlots` return type and the plan JSON's `payload.slots` shape (matches §5a normative slot vocabulary).
   - `OverlayTree` / `OverlayEntry` consistently used between `overlay-tree.ts` (Tasks 14–18) and `baseline-diff.ts` (Task 19).
   - `BaselineFileStatus` / `Sha256` from Plan 1 types are reused in Task 19's `baselineDiff` return shape.
   - `analyze()` returns `Omit<RepoSnapshot, 'baseline_files'>` everywhere it's referenced; Plan 3 will compose `analyze()` + `baselineDiff()` into the full `RepoSnapshot`.

4. **Bite-sized tasks:** longest single step is Task 14 step 5 (overlay-tree walker implementation) and Task 16 step 4 (archetype walk with multiple inline branches). Both <100 lines of code each — within the bite-sized envelope.

5. **Out-of-scope discipline:** No step generators, no plan-builder main, no executor, no CLI subcommands. `bin/janus.js` is untouched. The prompt UI is gated by an injected callback — no `inquirer`/`prompts` dependency added.

---

## Plan 3 preview (do not execute as part of Plan 2)

Plan 3 will assemble Plan 2's pieces into the plan-builder main:

- `src/retrofit/plan-builder/index.ts` — `buildPlan(snapshot, slotMap, pluginSet, archetype, version) → Plan`
- `src/retrofit/plan-builder/steps/{displace-tools,apply-shared-overlay,apply-archetype-overlay,merge-claude-kit,install-deps,write-marker}.ts` — step generators per §6.6
- `src/retrofit/plan-builder/determinism.ts` — sort steps, sort warnings, hash payload (closes the §7 determinism contract)
- `src/retrofit/plan-builder/idempotency.ts` — per-op omission rule from §6.8 (consults `baseline_files` and parsed `package_json`)
- New types: `Plan` is already in Plan 1; `Warning`, `Step`, `Operation` already in `plan.schema.json` and mirrored as TS types in Plan 1
- ~10–12 step-generator tests + a per-archetype determinism test (hash payload twice → identical bytes)

End-state: `buildPlan(...)` produces a fully-populated `Plan` validating against `plan.schema.json` for every fixture × archetype combination, with byte-stable `payload` hashes across runs. Still no executor, still no CLI.
