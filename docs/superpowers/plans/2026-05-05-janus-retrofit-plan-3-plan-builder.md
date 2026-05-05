# janus retrofit — Plan 3 of 5: Plan-Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose Plan 2's pieces into `buildPlan(snapshot, slotMap, pluginSet, archetype, version) → Plan` so that running it on any fixture produces a valid `Plan` JSON whose `payload` is byte-stable across runs.

**Architecture:** A pure function. Inputs come from Plan 2 modules. Output validates against `plan.schema.json` (Plan 1). Internally: per-category step generators emit operations against the overlay tree + snapshot; `idempotency.ts` strips no-op ops per §6.8; `warnings.ts` emits the cross-cutting warning catalog; `determinism.ts` performs the final sort/canonicalize. A `diagnose.ts` orchestrator wires `analyze() → baseline-diff → resolve* → buildPlan() → write JSON` end-to-end (still no CLI parsing — that lands in Plan 5).

**Tech Stack:** Same as Plan 2 — TypeScript 5.7 (strict, NodeNext), vitest 3.0, Node 24, no new runtime deps. Existing Ajv validators close the schema-conformance loop in tests.

**Out of scope for Plan 3:** Executor (operation handlers, git mutation, pre-flight #1-#16 — all Plan 4). CLI subcommands (Plan 5). The `--dry-run`, `--branch`, `--non-interactive` *flag wiring* in `bin/janus.js` (Plan 5). Documentation reads from `docs/conventions/dependencies.md` for the unrecognized_tools allowlist (Plan 5).

---

## Consumed types preview (from Plan 1 + Plan 2)

Plan 3 imports the following from `'../types/index.js'` (Plan 1 owns the surface):

- `Plan`, `Operation`, `Warning`, `Sha256` — schema-mirrored shapes used by step generators and `buildPlan`'s return value.
- `RepoSnapshot`, `BaselineFileStatus`, `PackageJsonSnapshot`, `ClaudeKitSnapshot`, `WorkflowFile`, `DisplacedTool` — analyzer outputs consumed in step generators and warnings.
- `SHELL_WHITELIST`, `ShellCommand` — the runtime const + derived literal-union of vetted shell command strings. Plan 3 references `SHELL_WHITELIST[i]` at every `op: 'shell'` emit site so the whitelist is the single source of truth (Tasks 4, 9).

From Plan 2's `'./overlay-tree.js'`:

- `OverlayResult` — `{ tree: OverlayTree; gitignore_lines: string[]; archetype_only: Set<string> }`. Plan 3 destructures all three fields; the `archetype_only` set is consumed directly by Task 12 (no recompute, no helper).

---

## Spec coverage map

| Spec § | Plan 3 deliverable |
|---|---|
| §6 plan-builder pure function signature | `plan-builder/index.ts` (Task 12) |
| §6.5 jq-merge clobber catalog (DEP_VERSION_CONFLICT + general overwrites) | `plan-builder/warnings.ts` (Task 11) |
| §6.6 step categories 1–7 | one task per category (Tasks 3–10) |
| §6.6 cross-category numeric ordering | `determinism.ts` (Task 2) |
| §6.6 warnings sort by `(code, evidence[0], message)` | `determinism.ts` (Task 2) |
| §6.6 commit_paths sorted alphabetically | each step generator + `determinism.ts` |
| §6.6 root-group split (root-dotfiles/configs/docs) | `apply-shared-overlay.ts` (Task 5) |
| §6.6 step id form (root-* bare; non-root prefixed) | `apply-shared-overlay.ts` (Task 5) |
| §6.6.5 archetype-overlay-vs-displaced-tools constraint check | assertion in `apply-archetype-overlay.ts` (Task 6) |
| §6.6 WARN_OVERWRITE_USER_KIT (`.claude/*` overwrites) | `warnings.ts` (Task 11) |
| §6.7 WORKFLOW_REFERENCES_DISPLACED_TOOL warning emission | `warnings.ts` (Task 11) |
| §6.8 per-op omission rule | `idempotency.ts` (Task 1) |
| §6.8 step-level drop on empty op list | `index.ts` (Task 12) |
| §7 Plan output validates against `plan.schema.json` | end-to-end test (Task 13) |
| §7 determinism contract | `determinism.ts` (Task 2) + per-archetype test (Task 13) |
| §8 SETTINGS_BASE construction (additions payload) | `merge-claude-kit.ts` (Task 7) |
| §8 SETTINGS_PERMISSION_REDUNDANT / SETTINGS_HOOK_CONFLICT / SETTINGS_SCALAR_CONFLICT | `warnings.ts` (Task 11) |
| §9 INSTALL_DEPS_MAY_FAIL (post-install dirty-state caveat) | `warnings.ts` (Task 11) |

---

## File structure

```
src/retrofit/plan-builder/
├── index.ts                 — buildPlan() entry; composes the per-category generators
├── diagnose.ts              — orchestrator: analyze → baseline-diff → resolve → buildPlan → write JSON
├── determinism.ts           — sort steps, sort warnings, sort commit_paths, JSON-canonicalize, hash
├── idempotency.ts           — per-op omission rules (§6.8)
├── warnings.ts              — emit the warning catalog (MODULE_TYPE_CHANGE, etc.)
└── steps/
    ├── displace-tools.ts            — displace-eslint, displace-prettier, displace-jest, displace-husky (special)
    ├── set-package-manager.ts       — delete non-pnpm lockfiles
    ├── apply-shared-overlay.ts      — group walker + root-* split
    ├── apply-archetype-overlay.ts   — group walker over archetype-only entries + 6.6.5 assertion
    ├── merge-claude-kit.ts          — 5 substeps; SETTINGS_BASE jq construction here
    ├── install-deps.ts              — pnpm install + commit pnpm-lock.yaml; monorepo-root skip
    └── write-marker.ts              — write .janus.json
```

---

## Task 1: idempotency.ts (per-op omission rule)

**Files:**
- Create: `src/retrofit/plan-builder/idempotency.ts`
- Create: `src/retrofit/plan-builder/idempotency.test.ts`

Pure functions consulting `RepoSnapshot` (and parsed JSON files like `package_json`) to decide whether each op kind would actually mutate. Steps with empty op lists after omission are dropped at the `index.ts` level (Task 12).

- [ ] **Step 1: Write failing tests**

`src/retrofit/plan-builder/idempotency.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { BaselineFileStatus, Operation, PackageJsonSnapshot } from '../types/index.js';
import { shouldEmit } from './idempotency.js';

const baseStatus = (over: Partial<BaselineFileStatus> = {}): BaselineFileStatus => ({
  path: 'foo.txt',
  status: 'missing',
  ...over,
});

describe('shouldEmit', () => {
  it('write_file: omits present_identical', () => {
    const op: Operation = { op: 'write_file', path: 'foo.txt', content: 'x' };
    const baseline = [baseStatus({ status: 'present_identical' })];
    expect(shouldEmit(op, { baseline_files: baseline })).toBe(false);
  });

  it('write_file: emits missing', () => {
    const op: Operation = { op: 'write_file', path: 'foo.txt', content: 'x' };
    const baseline = [baseStatus({ status: 'missing' })];
    expect(shouldEmit(op, { baseline_files: baseline })).toBe(true);
  });

  it('write_file: emits present_differs', () => {
    const op: Operation = { op: 'write_file', path: 'foo.txt', content: 'x' };
    const baseline = [baseStatus({ status: 'present_differs' })];
    expect(shouldEmit(op, { baseline_files: baseline })).toBe(true);
  });

  it('delete_file: omits when path is already absent', () => {
    const op: Operation = { op: 'delete_file', path: 'gone.txt' };
    const baseline = [baseStatus({ path: 'gone.txt', status: 'missing' })];
    expect(shouldEmit(op, { baseline_files: baseline })).toBe(false);
  });

  it('json_remove: omits when pointer already absent', () => {
    const op: Operation = { op: 'json_remove', path: 'package.json', pointer: '/scripts/test' };
    const pkg: PackageJsonSnapshot = { raw: { scripts: { lint: 'x' } } };
    expect(shouldEmit(op, { package_json: pkg })).toBe(false);
  });

  it('json_remove: emits when pointer is present', () => {
    const op: Operation = { op: 'json_remove', path: 'package.json', pointer: '/scripts/test' };
    const pkg: PackageJsonSnapshot = { raw: { scripts: { test: 'jest' } } };
    expect(shouldEmit(op, { package_json: pkg })).toBe(true);
  });

  it('json_set: omits when pointer already at target value', () => {
    const op: Operation = {
      op: 'json_set',
      path: 'package.json',
      pointer: '/type',
      value: 'module',
    };
    const pkg: PackageJsonSnapshot = { raw: { type: 'module' } };
    expect(shouldEmit(op, { package_json: pkg })).toBe(false);
  });

  it('chmod: omits when file already at target mode', () => {
    const op: Operation = { op: 'chmod', path: 'a.sh', mode: 0o755 };
    const baseline = [baseStatus({ path: 'a.sh', status: 'present_identical', current_mode: 0o755 })];
    expect(shouldEmit(op, { baseline_files: baseline })).toBe(false);
  });

  it('shell: never omitted', () => {
    const op: Operation = {
      op: 'shell',
      command: 'pnpm install',
      description: 'install',
    } as Operation;
    expect(shouldEmit(op, {})).toBe(true);
  });
});
```

- [ ] **Step 2: Implement idempotency.ts**

`src/retrofit/plan-builder/idempotency.ts`:

```ts
import type { BaselineFileStatus, Operation, PackageJsonSnapshot } from '../types/index.js';

export type IdempotencyContext = {
  baseline_files?: BaselineFileStatus[];
  package_json?: PackageJsonSnapshot;
};

export function shouldEmit(op: Operation, ctx: IdempotencyContext): boolean {
  switch (op.op) {
    case 'write_file': {
      const status = baselineOf(ctx, op.path);
      if (!status) return true;
      return status.status !== 'present_identical';
    }
    case 'delete_file': {
      const status = baselineOf(ctx, op.path);
      if (!status) return true;
      return status.status !== 'missing';
    }
    case 'delete_directory':
    case 'rename_file': {
      // Delete-dir: rely on caller to track dir existence; default to emit.
      // Rename: omit if source missing AND dest present (already done) — caller responsibility.
      return true;
    }
    case 'chmod': {
      const status = baselineOf(ctx, op.path);
      if (!status || status.status === 'missing') return true;
      return status.current_mode !== op.mode;
    }
    case 'json_set':
      return getPointer(ctx.package_json?.raw, op.pointer) !== op.value;
    case 'json_remove':
      return getPointer(ctx.package_json?.raw, op.pointer) !== undefined;
    case 'json_remove_matching':
      // Conservative: emit when the parent pointer exists. Plan-builder relies on the
      // executor's idempotent semantics to no-op if no keys match.
      return getPointer(ctx.package_json?.raw, op.pointer) !== undefined;
    case 'json_merge':
    case 'claude_settings_merge':
    case 'gitignore_merge':
      // Plan-builder caller computes the would-be merged content and does not call
      // shouldEmit() for these; it omits the op directly when the result is byte-equal.
      return true;
    case 'shell':
      return true;
  }
}

function baselineOf(ctx: IdempotencyContext, path: string): BaselineFileStatus | undefined {
  return ctx.baseline_files?.find((b) => b.path === path);
}

/**
 * Resolve a JSON Pointer (RFC 6901) against an arbitrary JSON value.
 * Returns undefined if any segment is missing.
 */
function getPointer(value: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) return value; // empty pointer = whole doc; treat unknown as undefined
  const segments = pointer.slice(1).split('/').map(unescapePointer);
  let cur = value;
  for (const seg of segments) {
    if (cur === undefined || cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function unescapePointer(seg: string): string {
  return seg.replaceAll('~1', '/').replaceAll('~0', '~');
}
```

- [ ] **Step 3: Run tests, verify pass**

Run: `pnpm test:unit -- idempotency.test`
Expected: PASS — 9/9.

- [ ] **Step 4: Commit**

```bash
pnpm typecheck
git add src/retrofit/plan-builder/idempotency.ts src/retrofit/plan-builder/idempotency.test.ts
git commit -m "feat(retrofit): plan-builder/idempotency.ts — per-op omission per §6.8"
```

---

## Task 2: determinism.ts (sort steps, sort warnings, hash payload)

**Files:**
- Create: `src/retrofit/plan-builder/determinism.ts`
- Create: `src/retrofit/plan-builder/determinism.test.ts`

Implements the §6.6 ordering rules and the §7 hash contract: cross-category numeric (1→7), within-category alphabetical by id, warnings sorted by `(code, evidence[0], message)`, `commit_paths` alphabetical per step. Hash is `sha256(JSON.stringify(payload, sortedKeys))`.

- [ ] **Step 1: Write failing tests**

`src/retrofit/plan-builder/determinism.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Plan } from '../types/index.js';
import { canonicalizePayload, hashPayload, sortSteps, sortWarnings } from './determinism.js';

describe('sortSteps', () => {
  it('orders by category number first, then alphabetical id', () => {
    const steps: Plan['payload']['steps'] = [
      { id: 'apply-shared-overlay/.github', category: 'apply-shared-overlay', title: 'gh', commit_message: 'chore: gh', preconditions: [], operations: [], commit_paths: [] },
      { id: 'displace-eslint', category: 'displace-tools', title: 'e', commit_message: 'chore: e', preconditions: [], operations: [], commit_paths: [] },
      { id: 'install-deps', category: 'install-deps', title: 'i', commit_message: 'chore: i', preconditions: [], operations: [], commit_paths: [] },
      { id: 'apply-shared-overlay/infra', category: 'apply-shared-overlay', title: 'i2', commit_message: 'chore: i2', preconditions: [], operations: [], commit_paths: [] },
      { id: 'set-package-manager', category: 'set-package-manager', title: 'p', commit_message: 'chore: p', preconditions: [], operations: [], commit_paths: [] },
      { id: 'root-dotfiles', category: 'apply-shared-overlay', title: 'r', commit_message: 'chore: r', preconditions: [], operations: [], commit_paths: [] },
    ];
    const sorted = sortSteps(steps);
    expect(sorted.map((s) => s.id)).toEqual([
      'displace-eslint',
      'set-package-manager',
      'apply-shared-overlay/.github',
      'apply-shared-overlay/infra',
      'root-dotfiles',
      'install-deps',
    ]);
  });
});

describe('sortWarnings', () => {
  it('orders by (code, evidence[0], message)', () => {
    const ws = [
      { code: 'MODULE_TYPE_CHANGE', message: 'b', evidence: ['package.json:type'] },
      { code: 'UNKNOWN_TOOL', message: 'a', evidence: [] },
      { code: 'MODULE_TYPE_CHANGE', message: 'a', evidence: ['package.json:type'] },
      { code: 'UNKNOWN_TOOL', message: 'a', evidence: ['z'] },
    ];
    const sorted = sortWarnings(ws);
    expect(sorted).toEqual([
      { code: 'MODULE_TYPE_CHANGE', message: 'a', evidence: ['package.json:type'] },
      { code: 'MODULE_TYPE_CHANGE', message: 'b', evidence: ['package.json:type'] },
      { code: 'UNKNOWN_TOOL', message: 'a', evidence: [] },
      { code: 'UNKNOWN_TOOL', message: 'a', evidence: ['z'] },
    ]);
  });
});

describe('canonicalizePayload + hashPayload', () => {
  it('produces byte-stable output for equivalent inputs in different key orders', () => {
    const a = { z: 1, a: { y: 2, b: 3 } };
    const b = { a: { b: 3, y: 2 }, z: 1 };
    expect(canonicalizePayload(a)).toBe(canonicalizePayload(b));
    expect(hashPayload(a)).toBe(hashPayload(b));
  });

  it('hash output starts with sha256:', () => {
    expect(hashPayload({})).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Implement determinism.ts**

`src/retrofit/plan-builder/determinism.ts`:

```ts
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

export function sortWarnings(
  warnings: Plan['payload']['warnings'],
): Plan['payload']['warnings'] {
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
```

- [ ] **Step 3: Run, verify pass, commit**

```bash
pnpm test:unit -- determinism.test
pnpm typecheck
git add src/retrofit/plan-builder/determinism.ts src/retrofit/plan-builder/determinism.test.ts
git commit -m "feat(retrofit): plan-builder/determinism.ts — step/warning/payload canonicalization + hash"
```

---

## Task 3: steps/displace-tools.ts (eslint, prettier, jest — simple)

**Files:**
- Create: `src/retrofit/plan-builder/steps/displace-tools.ts`
- Create: `src/retrofit/plan-builder/steps/displace-tools.test.ts`

Generates one `displace-<tool>` step per detected tool. Husky has its own task (Task 4) due to its `.git/`-side cleanup ops.

- [ ] **Step 1: Write the failing test**

`src/retrofit/plan-builder/steps/displace-tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DisplacedTool } from '../../types/index.js';
import { generateDisplaceToolsSteps } from './displace-tools.js';

describe('generateDisplaceToolsSteps', () => {
  it('emits a displace-eslint step with delete + json_remove ops', () => {
    const tools: DisplacedTool[] = [
      { name: 'eslint', evidence: ['.eslintrc.json', 'package.json:devDependencies.eslint'] },
    ];
    const steps = generateDisplaceToolsSteps(tools);
    const eslint = steps.find((s) => s.id === 'displace-eslint');
    expect(eslint).toBeDefined();
    expect(eslint!.category).toBe('displace-tools');
    expect(eslint!.commit_message).toBe('chore: remove eslint in favor of biome');
    const opNames = eslint!.operations.map((o) => o.op);
    expect(opNames).toContain('delete_file');
    expect(opNames).toContain('json_remove');
    expect(opNames).toContain('json_remove_matching');
    expect(eslint!.commit_paths).toContain('package.json');
  });

  it('emits separate steps for each tool', () => {
    const tools: DisplacedTool[] = [
      { name: 'prettier', evidence: ['.prettierrc'] },
      { name: 'jest', evidence: ['jest.config.js', 'package.json:devDependencies.jest'] },
    ];
    const steps = generateDisplaceToolsSteps(tools);
    expect(steps.map((s) => s.id).sort()).toEqual(['displace-jest', 'displace-prettier']);
  });

  it('returns empty for no tools', () => {
    expect(generateDisplaceToolsSteps([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement displace-tools.ts**

`src/retrofit/plan-builder/steps/displace-tools.ts`:

```ts
import type { DisplacedTool, Plan } from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

export function generateDisplaceToolsSteps(tools: DisplacedTool[]): Step[] {
  return tools.flatMap((tool) => {
    if (tool.name === 'husky') return []; // Task 4 handles husky specially.
    return [generateOne(tool)];
  });
}

function generateOne(tool: DisplacedTool): Step {
  const fileEvidence = tool.evidence.filter((e) => !e.startsWith('package.json:'));
  const operations: Step['operations'] = [];

  for (const path of fileEvidence) {
    operations.push({ op: 'delete_file', path });
  }
  // Always remove devDeps + scripts entry if present (idempotency layer drops if absent).
  operations.push({ op: 'json_remove', path: 'package.json', pointer: `/devDependencies/${tool.name}` });
  operations.push({
    op: 'json_remove_matching',
    path: 'package.json',
    pointer: '/scripts',
    value_regex: `\\b${escapeRegex(tool.name)}\\b`,
  });

  const commit_paths = [...new Set([...fileEvidence, 'package.json'])].sort();

  return {
    id: `displace-${tool.name}`,
    category: 'displace-tools',
    title: `Remove ${tool.name}`,
    commit_message: commitMessageFor(tool.name),
    preconditions: [],
    operations,
    commit_paths,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function commitMessageFor(name: DisplacedTool['name']): string {
  switch (name) {
    case 'eslint':
      return 'chore: remove eslint in favor of biome';
    case 'prettier':
      return 'chore: remove prettier in favor of biome';
    case 'jest':
      return 'chore: remove jest in favor of vitest';
    case 'commitlint_old':
      return 'chore: replace commitlint config';
    case 'husky':
      return 'chore: remove husky in favor of lefthook';
  }
}
```

- [ ] **Step 3: Run, verify pass, commit**

```bash
pnpm test:unit -- "steps/displace-tools"
pnpm typecheck
git add src/retrofit/plan-builder/steps/displace-tools.ts src/retrofit/plan-builder/steps/displace-tools.test.ts
git commit -m "feat(retrofit): steps/displace-tools.ts — eslint/prettier/jest generators"
```

---

## Task 4: steps/displace-husky (special — .git/ cleanup ops)

**Files:**
- Modify: `src/retrofit/plan-builder/steps/displace-tools.ts`
- Modify: `src/retrofit/plan-builder/steps/displace-tools.test.ts`

Husky's removal needs `.husky/` deleted, `package.json` cleaned, AND two `shell` ops to clear git config + orphan hook shims. Per §6.6 step 1 the order is fixed.

- [ ] **Step 1: Add the failing test**

Append to `src/retrofit/plan-builder/steps/displace-tools.test.ts`:

```ts
it('emits displace-husky with the §6.6.1 op sequence', () => {
  const steps = generateDisplaceToolsSteps([
    { name: 'husky', evidence: ['.husky/', 'package.json:devDependencies.husky'] },
  ]);
  const husky = steps.find((s) => s.id === 'displace-husky');
  expect(husky).toBeDefined();
  expect(husky!.operations.map((o) => o.op)).toEqual([
    'delete_directory',
    'json_remove',
    'json_remove_matching',
    'shell',
    'shell',
  ]);
  // Order matters: delete_directory FIRST, shells LAST.
  expect((husky!.operations[0] as { path: string }).path).toBe('.husky');
  // The two shell commands are the documented whitelist entries (c) and (d).
  const shells = husky!.operations.filter((o) => o.op === 'shell') as Array<{ command: string }>;
  expect(shells[0]!.command).toBe('git config --unset core.hooksPath');
  expect(shells[1]!.command).toBe('find .git/hooks -type f -not -name "*.sample" -delete');
});
```

- [ ] **Step 2: Extend displace-tools.ts**

At the top of `displace-tools.ts`, extend the import to pull `SHELL_WHITELIST` from Plan 1's types barrel:

```ts
import type { DisplacedTool, Plan } from '../../types/index.js';
import { SHELL_WHITELIST } from '../../types/index.js';
```

In `generateDisplaceToolsSteps`, replace the husky-skip branch:

```ts
if (tool.name === 'husky') return [generateHusky()];
```

Add at the bottom of the file:

```ts
function generateHusky(): Step {
  return {
    id: 'displace-husky',
    category: 'displace-tools',
    title: 'Remove husky',
    commit_message: 'chore: remove husky in favor of lefthook',
    preconditions: [],
    operations: [
      { op: 'delete_directory', path: '.husky' },
      { op: 'json_remove', path: 'package.json', pointer: '/devDependencies/husky' },
      {
        op: 'json_remove_matching',
        path: 'package.json',
        pointer: '/scripts',
        key_regex: '^(prepare|postinstall)$',
      },
      // 'git config --unset core.hooksPath'
      { op: 'shell', command: SHELL_WHITELIST[2], commit_paths: [] },
      // 'find .git/hooks -type f -not -name "*.sample" -delete'
      {
        op: 'shell',
        command: SHELL_WHITELIST[3],
        commit_paths: [],
      },
    ],
    commit_paths: ['package.json'],
  };
}
```

Note: `SHELL_WHITELIST` is the runtime const exported by Plan 1 from `src/retrofit/types/index.ts`. Index `[2]` is `'git config --unset core.hooksPath'`; index `[3]` is `'find .git/hooks -type f -not -name "*.sample" -delete'`. The test asserting the literal string values still passes because TypeScript narrows `SHELL_WHITELIST[2]` / `[3]` to the exact string literals.

- [ ] **Step 3: Run, verify pass, commit**

```bash
pnpm test:unit -- "steps/displace-tools"
pnpm typecheck
git add src/retrofit/plan-builder/steps/displace-tools.ts src/retrofit/plan-builder/steps/displace-tools.test.ts
git commit -m "feat(retrofit): steps/displace-tools.ts — husky-special op sequence with .git/ cleanup"
```

---

## Task 5: steps/apply-shared-overlay.ts (with root-* split)

**Files:**
- Create: `src/retrofit/plan-builder/steps/apply-shared-overlay.ts`
- Create: `src/retrofit/plan-builder/steps/apply-shared-overlay.test.ts`

Walks the overlay tree's *shared* subset (excluding `_shared/.claude/**`, which is owned by `merge-claude-kit`). Groups by first path segment. Files at the root are partitioned into `root-dotfiles`, `root-configs`, `root-docs`. Attaches the `gitignore_merge` op to `root-dotfiles`.

- [ ] **Step 1: Write the failing test**

`src/retrofit/plan-builder/steps/apply-shared-overlay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { OverlayTree } from '../../types/index.js';
import { generateApplySharedOverlaySteps } from './apply-shared-overlay.js';

const tree = (entries: Array<[string, string]>): OverlayTree => {
  const m: OverlayTree = new Map();
  for (const [k, v] of entries) m.set(k, { content: Buffer.from(v, 'utf8'), mode: 0o644 });
  return m;
};

describe('generateApplySharedOverlaySteps', () => {
  it('groups files by first path segment', () => {
    const t = tree([
      ['.github/workflows/ci.yml', 'name: ci'],
      ['.github/dependabot.yml', 'version: 2'],
      ['docs/conventions/foo.md', 'x'],
      ['biome.jsonc', '{}'],
      ['AGENTS.md', '#'],
    ]);
    const steps = generateApplySharedOverlaySteps(t, [], { has_user_gitignore: false, gitignore_lines: [] });
    const ids = steps.map((s) => s.id).sort();
    expect(ids).toEqual([
      'apply-shared-overlay/.github',
      'apply-shared-overlay/docs',
      'root-configs',
      'root-docs',
    ]);
  });

  it('partitions root files into dotfiles/configs/docs', () => {
    const t = tree([
      ['.editorconfig', 'x'],
      ['.gitattributes', 'x'],
      ['biome.jsonc', '{}'],
      ['package.json', '{}'],
      ['AGENTS.md', '#'],
      ['README.md', '#'],
      ['LICENSE', 'MIT'],
    ]);
    const steps = generateApplySharedOverlaySteps(t, [], { has_user_gitignore: false, gitignore_lines: [] });
    const dotfiles = steps.find((s) => s.id === 'root-dotfiles')!;
    const configs = steps.find((s) => s.id === 'root-configs')!;
    const docs = steps.find((s) => s.id === 'root-docs')!;
    expect(dotfiles.commit_paths).toEqual(expect.arrayContaining(['.editorconfig', '.gitattributes']));
    expect(configs.commit_paths).toEqual(expect.arrayContaining(['biome.jsonc', 'package.json']));
    expect(docs.commit_paths).toEqual(expect.arrayContaining(['AGENTS.md', 'LICENSE', 'README.md']));
  });

  it('attaches gitignore_merge to root-dotfiles when user has .gitignore', () => {
    const t = tree([['.editorconfig', 'x']]);
    const steps = generateApplySharedOverlaySteps(t, [], {
      has_user_gitignore: true,
      gitignore_lines: ['node_modules/', 'dist/'],
    });
    const dotfiles = steps.find((s) => s.id === 'root-dotfiles')!;
    const merge = dotfiles.operations.find((o) => o.op === 'gitignore_merge');
    expect(merge).toBeDefined();
    expect((merge as { lines: string[] }).lines).toEqual(['node_modules/', 'dist/']);
    expect(dotfiles.commit_paths).toContain('.gitignore');
  });

  it('uses write_file when user has no .gitignore', () => {
    const t = tree([['.editorconfig', 'x']]);
    const steps = generateApplySharedOverlaySteps(t, [], {
      has_user_gitignore: false,
      gitignore_lines: ['node_modules/'],
    });
    const dotfiles = steps.find((s) => s.id === 'root-dotfiles')!;
    const writeIgnore = dotfiles.operations.find(
      (o) => o.op === 'write_file' && (o as { path: string }).path === '.gitignore',
    );
    expect(writeIgnore).toBeDefined();
  });

  it('skips _shared/.claude/** entries (owned by merge-claude-kit)', () => {
    const t = tree([
      ['.claude/hooks/foo.sh', '#!/bin/sh'],
      ['biome.jsonc', '{}'],
    ]);
    const steps = generateApplySharedOverlaySteps(t, [], { has_user_gitignore: false, gitignore_lines: [] });
    expect(steps.find((s) => s.id === 'apply-shared-overlay/.claude')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement apply-shared-overlay.ts**

`src/retrofit/plan-builder/steps/apply-shared-overlay.ts`:

```ts
import type { BaselineFileStatus, Operation, OverlayTree, Plan, Sha256 } from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

const ROOT_DOTFILES = new Set([
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.nvmrc',
  '.node-version',
  '.env.example',
]);
const ROOT_CONFIGS = new Set([
  'biome.jsonc',
  'lefthook.yml',
  'commitlint.config.js',
  'tsconfig.base.json',
  'tsconfig.json',
  'vitest.config.ts',
  'package.json',
]);
const ROOT_DOCS = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md', 'LICENSE', 'SECURITY.md', 'CODEOWNERS']);

export type ApplySharedCtx = {
  has_user_gitignore: boolean;
  gitignore_lines: string[];
};

export function generateApplySharedOverlaySteps(
  tree: OverlayTree,
  baseline: BaselineFileStatus[],
  ctx: ApplySharedCtx,
): Step[] {
  // Bucket entries by group. Skip .claude/** — owned by merge-claude-kit.
  const buckets = new Map<string, string[]>();
  for (const path of tree.keys()) {
    if (path.startsWith('.claude/')) continue;
    const group = bucketFor(path);
    if (!group) continue;
    const arr = buckets.get(group) ?? [];
    arr.push(path);
    buckets.set(group, arr);
  }

  const steps: Step[] = [];
  for (const [group, paths] of buckets) {
    paths.sort();
    const operations: Operation[] = paths.map((p) => writeFileOp(p, tree, baseline));
    const commit_paths = [...paths];

    // Attach gitignore op to root-dotfiles only.
    if (group === 'root-dotfiles' && ctx.gitignore_lines.length > 0) {
      if (ctx.has_user_gitignore) {
        operations.push({
          op: 'gitignore_merge',
          path: '.gitignore',
          lines: ctx.gitignore_lines,
        });
      } else {
        operations.push({
          op: 'write_file',
          path: '.gitignore',
          content: `${ctx.gitignore_lines.join('\n')}\n`,
        });
      }
      commit_paths.push('.gitignore');
    }

    steps.push({
      id: group,
      category: 'apply-shared-overlay',
      title: titleFor(group),
      commit_message: commitMessageFor(group),
      preconditions: [],
      operations,
      commit_paths: commit_paths.sort(),
    });
  }

  return steps;
}

function bucketFor(path: string): string | undefined {
  // Root files
  if (ROOT_DOTFILES.has(path)) return 'root-dotfiles';
  if (ROOT_CONFIGS.has(path)) return 'root-configs';
  if (ROOT_DOCS.has(path)) return 'root-docs';
  // Non-root files: prefix with category name.
  const firstSeg = path.split('/')[0]!;
  if (firstSeg === path) return undefined; // unknown root file — ignore (data-driven extensibility)
  return `apply-shared-overlay/${firstSeg}`;
}

function writeFileOp(path: string, tree: OverlayTree, baseline: BaselineFileStatus[]): Operation {
  const entry = tree.get(path)!;
  const status = baseline.find((b) => b.path === path);
  const mode = entry.mode === 0o644 ? undefined : entry.mode;
  if (status?.status === 'present_differs') {
    return {
      op: 'write_file',
      path,
      content: entry.content.toString('utf8'),
      ...(mode !== undefined ? { mode } : {}),
      pre_state_hash: status.pre_state_hash as Sha256,
      overwrite: true,
    };
  }
  // missing or no baseline entry
  return {
    op: 'write_file',
    path,
    content: entry.content.toString('utf8'),
    ...(mode !== undefined ? { mode } : {}),
  };
}

function titleFor(group: string): string {
  switch (group) {
    case 'root-dotfiles':
      return 'Apply janus root dotfiles';
    case 'root-configs':
      return 'Apply janus root configs';
    case 'root-docs':
      return 'Apply janus root docs';
    default:
      return `Apply janus shared overlay (${group.replace('apply-shared-overlay/', '')})`;
  }
}

function commitMessageFor(group: string): string {
  switch (group) {
    case 'root-dotfiles':
      return 'chore: apply janus root dotfiles';
    case 'root-configs':
      return 'chore: apply janus root configs';
    case 'root-docs':
      return 'chore: apply janus root docs';
    default:
      return `chore: apply janus shared overlay (${group.replace('apply-shared-overlay/', '')})`;
  }
}
```

- [ ] **Step 3: Run, verify pass, commit**

```bash
pnpm test:unit -- "steps/apply-shared-overlay"
pnpm typecheck
git add src/retrofit/plan-builder/steps/apply-shared-overlay.ts src/retrofit/plan-builder/steps/apply-shared-overlay.test.ts
git commit -m "feat(retrofit): steps/apply-shared-overlay.ts — group buckets + root-* split + gitignore attachment"
```

---

## Task 6: steps/apply-archetype-overlay.ts

**Files:**
- Create: `src/retrofit/plan-builder/steps/apply-archetype-overlay.ts`
- Create: `src/retrofit/plan-builder/steps/apply-archetype-overlay.test.ts`

Generates `apply-archetype-overlay` steps for archetype-only entries (the diff between archetype-walked tree and shared-walked tree). Asserts the §6.6.5 rule: no archetype overlay file path may be in the displaced-tools allowlist.

- [ ] **Step 1: Write the failing test**

`src/retrofit/plan-builder/steps/apply-archetype-overlay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { OverlayTree } from '../../types/index.js';
import { generateApplyArchetypeOverlaySteps } from './apply-archetype-overlay.js';

const tree = (entries: string[]): OverlayTree => {
  const m: OverlayTree = new Map();
  for (const k of entries) m.set(k, { content: Buffer.from('x', 'utf8'), mode: 0o644 });
  return m;
};

describe('generateApplyArchetypeOverlaySteps', () => {
  it('emits one step per top-level group of archetype-only files', () => {
    const archetypeOnly = new Set(['host.json', 'src/index.ts', 'tests/x.test.ts']);
    const steps = generateApplyArchetypeOverlaySteps(tree([...archetypeOnly]), [], archetypeOnly);
    const ids = steps.map((s) => s.id).sort();
    expect(ids).toEqual([
      'apply-archetype-overlay/host.json', // single-file root group
      'apply-archetype-overlay/src',
      'apply-archetype-overlay/tests',
    ]);
  });

  it('throws if archetype overlay contains a displaced-tool config (§6.6.5)', () => {
    expect(() =>
      generateApplyArchetypeOverlaySteps(tree(['.eslintrc.json']), [], new Set(['.eslintrc.json'])),
    ).toThrow(/ARCHETYPE_DISPLACED_TOOL_CONFLICT/);
  });

  it('returns empty when archetype contributes nothing', () => {
    expect(generateApplyArchetypeOverlaySteps(tree([]), [], new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: Implement apply-archetype-overlay.ts**

`src/retrofit/plan-builder/steps/apply-archetype-overlay.ts`:

```ts
import type { BaselineFileStatus, Operation, OverlayTree, Plan, Sha256 } from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

const DISPLACED_FILE_PATTERNS = [
  /^\.eslintrc\./,
  /^eslint\.config\./,
  /^\.prettierrc/,
  /^prettier\.config\./,
  /^jest\.config\./,
  /^\.husky\//,
];

export function generateApplyArchetypeOverlaySteps(
  tree: OverlayTree,
  baseline: BaselineFileStatus[],
  archetypeOnly: Set<string>,
): Step[] {
  // §6.6.5 assertion.
  for (const path of archetypeOnly) {
    if (DISPLACED_FILE_PATTERNS.some((re) => re.test(path))) {
      throw new Error(
        `ARCHETYPE_DISPLACED_TOOL_CONFLICT: archetype ships ${path}, which is in the displaced-tools allowlist`,
      );
    }
  }

  const buckets = new Map<string, string[]>();
  for (const path of archetypeOnly) {
    const segs = path.split('/');
    const group = segs.length === 1 ? `apply-archetype-overlay/${path}` : `apply-archetype-overlay/${segs[0]}`;
    const arr = buckets.get(group) ?? [];
    arr.push(path);
    buckets.set(group, arr);
  }

  const steps: Step[] = [];
  for (const [group, paths] of buckets) {
    paths.sort();
    const operations: Operation[] = paths.map((p) => writeFileOp(p, tree, baseline));
    steps.push({
      id: group,
      category: 'apply-archetype-overlay',
      title: `Apply archetype overlay (${group.replace('apply-archetype-overlay/', '')})`,
      commit_message: `chore: apply archetype overlay (${group.replace('apply-archetype-overlay/', '')})`,
      preconditions: [],
      operations,
      commit_paths: [...paths].sort(),
    });
  }
  return steps;
}

function writeFileOp(path: string, tree: OverlayTree, baseline: BaselineFileStatus[]): Operation {
  const entry = tree.get(path)!;
  const status = baseline.find((b) => b.path === path);
  const mode = entry.mode === 0o644 ? undefined : entry.mode;
  if (status?.status === 'present_differs') {
    return {
      op: 'write_file',
      path,
      content: entry.content.toString('utf8'),
      ...(mode !== undefined ? { mode } : {}),
      pre_state_hash: status.pre_state_hash as Sha256,
      overwrite: true,
    };
  }
  return {
    op: 'write_file',
    path,
    content: entry.content.toString('utf8'),
    ...(mode !== undefined ? { mode } : {}),
  };
}
```

- [ ] **Step 3: Run, verify pass, commit**

```bash
pnpm test:unit -- "steps/apply-archetype-overlay"
pnpm typecheck
git add src/retrofit/plan-builder/steps/apply-archetype-overlay.ts src/retrofit/plan-builder/steps/apply-archetype-overlay.test.ts
git commit -m "feat(retrofit): steps/apply-archetype-overlay.ts — group buckets + §6.6.5 conflict assertion"
```

---

## Task 7: steps/merge-claude-kit.ts (5 substeps + SETTINGS_BASE construction)

**Files:**
- Create: `src/retrofit/plan-builder/steps/merge-claude-kit.ts`
- Create: `src/retrofit/plan-builder/steps/merge-claude-kit.test.ts`
- Create: `src/retrofit/plan-builder/steps/settings-base.ts` — the SETTINGS_BASE jq construction
- Create: `src/retrofit/plan-builder/steps/settings-base.test.ts`

Five substeps per §6.6.5: claude-settings-merge, claude-md-snapshot, claude-skills-overlay, claude-hooks-overlay, claude-misc-overlay. The settings additions payload is computed by replicating scaffold.sh's `SETTINGS_BASE` jq logic (lines 354–426).

- [ ] **Step 1: Write SETTINGS_BASE test**

`src/retrofit/plan-builder/steps/settings-base.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSettingsBase } from './settings-base.js';

describe('buildSettingsBase', () => {
  it('emits OTEL_RESOURCE_ATTRIBUTES with workload', () => {
    const s = buildSettingsBase({ workload: 'foo', plugins: [] });
    expect(s.env?.OTEL_RESOURCE_ATTRIBUTES).toBe('project=foo');
  });

  it('includes the standard permissions allow/deny sets', () => {
    const s = buildSettingsBase({ workload: 'foo', plugins: [] });
    expect(s.permissions?.allow).toEqual(expect.arrayContaining(['Bash(pnpm *)', 'Read(**)']));
    expect(s.permissions?.deny).toEqual(expect.arrayContaining(['Bash(rm -rf *)', 'Read(.env)']));
  });

  it('includes the four hook entries', () => {
    const s = buildSettingsBase({ workload: 'foo', plugins: [] });
    expect(Object.keys(s.hooks ?? {})).toEqual(
      expect.arrayContaining(['SessionStart', 'SessionEnd', 'WorktreeCreate', 'WorktreeRemove']),
    );
  });

  it('plugs plugins into enabledPlugins', () => {
    const s = buildSettingsBase({
      workload: 'foo',
      plugins: ['frontend-design@claude-plugins-official', 'playwright@claude-plugins-official'],
    });
    expect(s.enabledPlugins).toEqual({
      'frontend-design@claude-plugins-official': true,
      'playwright@claude-plugins-official': true,
    });
  });
});
```

- [ ] **Step 2: Implement settings-base.ts**

`src/retrofit/plan-builder/steps/settings-base.ts`:

```ts
export type SettingsBase = {
  env?: Record<string, string>;
  worktree?: { symlinkDirectories: string[] };
  permissions?: { allow: string[]; deny: string[] };
  cleanupPeriodDays?: number;
  hooks?: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command: string; timeout?: number }> }>>;
  enabledPlugins?: Record<string, true>;
};

export function buildSettingsBase(args: { workload: string; plugins: string[] }): SettingsBase {
  const base: SettingsBase = {
    env: { OTEL_RESOURCE_ATTRIBUTES: `project=${args.workload}` },
    worktree: { symlinkDirectories: ['node_modules'] },
    permissions: {
      allow: [
        'Bash(pnpm *)',
        'Bash(npx tsc *)',
        'Bash(gh issue:*)',
        'Bash(gh pr:*)',
        'Bash(gh api:*)',
        'Bash(gh search:*)',
        'Bash(gh label:*)',
        'Bash(gh run:*)',
        'Bash(gh repo view:*)',
        'Bash(gh workflow:*)',
        'Bash(git status:*)',
        'Bash(git diff:*)',
        'Bash(git log:*)',
        'Read(**)',
        'Grep(**)',
        'WebFetch(https://code.claude.com/*)',
        'WebFetch(https://docs.claude.com/*)',
        'WebFetch(https://learn.microsoft.com/*)',
      ],
      deny: [
        'Bash(rm -rf *)',
        'Bash(sudo *)',
        'Bash(git push --force:*)',
        'Bash(git push * main)',
        'Bash(npm publish *)',
        'Bash(pnpm publish *)',
        'Read(~/.ssh/**)',
        'Read(~/.aws/**)',
        'Read(~/.gnupg/**)',
        'Read(.env.local)',
        'Read(.env)',
        'Bash(curl * | bash)',
        'Bash(curl * | sh)',
        'Bash(wget * | bash)',
        'Bash(wget * | sh)',
      ],
    },
    cleanupPeriodDays: 7,
    hooks: {
      SessionStart: [
        {
          matcher: 'startup|clear|compact',
          hooks: [{ type: 'command', command: '.claude/hooks/session-start.sh', timeout: 15 }],
        },
      ],
      SessionEnd: [{ hooks: [{ type: 'command', command: '.claude/hooks/session-end.sh', timeout: 15 }] }],
      WorktreeCreate: [
        { hooks: [{ type: 'command', command: '.claude/hooks/setup-worktree.sh', timeout: 30 }] },
      ],
      WorktreeRemove: [
        { hooks: [{ type: 'command', command: '.claude/hooks/cleanup-worktree.sh', timeout: 15 }] },
      ],
    },
  };
  if (args.plugins.length > 0) {
    base.enabledPlugins = Object.fromEntries(args.plugins.map((p) => [p, true as const]));
  }
  return base;
}
```

- [ ] **Step 3: Run, verify pass**

Run: `pnpm test:unit -- settings-base.test`
Expected: PASS — 4/4.

- [ ] **Step 4: Write merge-claude-kit test**

`src/retrofit/plan-builder/steps/merge-claude-kit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ClaudeKitSnapshot, OverlayTree, Sha256 } from '../../types/index.js';
import { generateMergeClaudeKitSteps } from './merge-claude-kit.js';

const tree = (entries: Array<[string, string, number?]>): OverlayTree => {
  const m: OverlayTree = new Map();
  for (const [k, v, mode] of entries) m.set(k, { content: Buffer.from(v, 'utf8'), mode: mode ?? 0o644 });
  return m;
};

const emptyKit: ClaudeKitSnapshot = {
  has_claude_dir: false,
  has_settings_json: false,
  has_claude_md: false,
  has_pre_janus_md: false,
  hooks: [],
  skills: [],
  misc: [],
};

describe('generateMergeClaudeKitSteps', () => {
  it('emits all 5 substep ids when janus ships content for each', () => {
    const t = tree([
      ['.claude/hooks/foo.sh', '#!/bin/sh', 0o755],
      ['.claude/skills/bar.md', '#'],
      ['.claude/README.md', '#'],
      ['CLAUDE.md', '@AGENTS.md\n'],
    ]);
    const steps = generateMergeClaudeKitSteps(t, emptyKit, {
      workload: 'foo',
      plugins: [],
    });
    const ids = steps.map((s) => s.id).sort();
    expect(ids).toContain('claude-settings-merge');
    expect(ids).toContain('claude-md-snapshot');
    expect(ids).toContain('claude-skills-overlay');
    expect(ids).toContain('claude-hooks-overlay');
    expect(ids).toContain('claude-misc-overlay');
  });

  it('claude-settings-merge carries settings additions payload + pre_state_hash if user has one', () => {
    const userKit: ClaudeKitSnapshot = { ...emptyKit, has_claude_dir: true, has_settings_json: true };
    const steps = generateMergeClaudeKitSteps(tree([['CLAUDE.md', '@AGENTS.md\n']]), userKit, {
      workload: 'foo',
      plugins: ['frontend-design@claude-plugins-official'],
      settings_pre_state_hash: 'sha256:00' as Sha256,
    });
    const settings = steps.find((s) => s.id === 'claude-settings-merge');
    expect(settings).toBeDefined();
    const op = settings!.operations[0]!;
    expect(op.op).toBe('claude_settings_merge');
    expect((op as { additions: { enabledPlugins?: Record<string, boolean> } }).additions.enabledPlugins).toEqual({
      'frontend-design@claude-plugins-official': true,
    });
    expect((op as { pre_state_hash?: string }).pre_state_hash).toBe('sha256:00');
  });

  it('claude-md-snapshot only emits rename when CLAUDE.md exists', () => {
    const userKit: ClaudeKitSnapshot = { ...emptyKit, has_claude_md: true };
    const steps = generateMergeClaudeKitSteps(tree([['CLAUDE.md', '@AGENTS.md\n']]), userKit, {
      workload: 'foo',
      plugins: [],
    });
    const snap = steps.find((s) => s.id === 'claude-md-snapshot')!;
    expect(snap.operations.find((o) => o.op === 'rename_file')).toBeDefined();
  });
});
```

- [ ] **Step 5: Implement merge-claude-kit.ts**

`src/retrofit/plan-builder/steps/merge-claude-kit.ts`:

```ts
import type {
  ClaudeKitSnapshot,
  Operation,
  OverlayTree,
  Plan,
  Sha256,
} from '../../types/index.js';
import { buildSettingsBase, type SettingsBase } from './settings-base.js';

type Step = Plan['payload']['steps'][number];

export type MergeClaudeKitOpts = {
  workload: string;
  plugins: string[];
  /** sha256 of user's existing .claude/settings.json at diagnose time, if present. */
  settings_pre_state_hash?: Sha256;
  /** sha256 of user's existing CLAUDE.md, if present. */
  claude_md_pre_state_hash?: Sha256;
};

export function generateMergeClaudeKitSteps(
  tree: OverlayTree,
  userKit: ClaudeKitSnapshot,
  opts: MergeClaudeKitOpts,
): Step[] {
  const steps: Step[] = [];
  const settings = buildSettingsBase({ workload: opts.workload, plugins: opts.plugins });

  // 1. claude-settings-merge — always (janus ships hooks + permissions even on a fresh repo).
  steps.push(buildSettingsMergeStep(settings, opts.settings_pre_state_hash));

  // 2. claude-md-snapshot — only when janus's CLAUDE.md ships (it does, via shared template).
  if (tree.has('CLAUDE.md')) {
    steps.push(buildClaudeMdSnapshotStep(tree, userKit, opts.claude_md_pre_state_hash));
  }

  // 3-5. skills / hooks / misc — one step per category, only if janus has any.
  const skills = listEntries(tree, '.claude/skills/');
  if (skills.length > 0) steps.push(buildOverlayStep('claude-skills-overlay', skills, tree, 'skills'));

  const hooks = listEntries(tree, '.claude/hooks/');
  if (hooks.length > 0) steps.push(buildOverlayStep('claude-hooks-overlay', hooks, tree, 'hooks'));

  const misc = [...tree.keys()].filter(
    (p) =>
      p.startsWith('.claude/') &&
      !p.startsWith('.claude/hooks/') &&
      !p.startsWith('.claude/skills/') &&
      p !== '.claude/settings.json',
  );
  if (misc.length > 0) steps.push(buildOverlayStep('claude-misc-overlay', misc, tree, 'misc'));

  return steps;
}

function buildSettingsMergeStep(settings: SettingsBase, preHash: Sha256 | undefined): Step {
  const op: Operation = {
    op: 'claude_settings_merge',
    path: '.claude/settings.json',
    additions: settings,
    ...(preHash ? { pre_state_hash: preHash } : {}),
  };
  return {
    id: 'claude-settings-merge',
    category: 'merge-claude-kit',
    title: 'Merge .claude/settings.json',
    commit_message: 'chore: merge .claude/settings.json',
    preconditions: [],
    operations: [op],
    commit_paths: ['.claude/settings.json'],
  };
}

function buildClaudeMdSnapshotStep(
  tree: OverlayTree,
  userKit: ClaudeKitSnapshot,
  preHash: Sha256 | undefined,
): Step {
  const operations: Operation[] = [];
  if (userKit.has_claude_md) {
    operations.push({
      op: 'rename_file',
      from: 'CLAUDE.md',
      to: 'CLAUDE.pre-janus.md',
      ...(preHash ? { pre_state_hash: preHash } : {}),
    });
  }
  const janusContent = tree.get('CLAUDE.md')!.content.toString('utf8');
  // Insert @CLAUDE.pre-janus.md as second line if user had a prior CLAUDE.md.
  const finalContent = userKit.has_claude_md
    ? janusContent.replace(/^(@AGENTS\.md\n)/, '$1@CLAUDE.pre-janus.md\n')
    : janusContent;
  // Plan-builder safeguard from §8: janus CLAUDE.md must begin with @AGENTS.md\n.
  if (!janusContent.startsWith('@AGENTS.md\n')) {
    throw new Error('CLAUDE_TEMPLATE_UNEXPECTED_HEAD');
  }
  operations.push({ op: 'write_file', path: 'CLAUDE.md', content: finalContent, overwrite: true });
  const commit_paths = userKit.has_claude_md
    ? ['CLAUDE.md', 'CLAUDE.pre-janus.md']
    : ['CLAUDE.md'];
  return {
    id: 'claude-md-snapshot',
    category: 'merge-claude-kit',
    title: 'Snapshot existing CLAUDE.md and overlay janus version',
    commit_message: 'chore: snapshot CLAUDE.md and overlay janus version',
    preconditions: [],
    operations,
    commit_paths,
  };
}

function buildOverlayStep(id: string, paths: string[], tree: OverlayTree, label: string): Step {
  paths.sort();
  const operations: Operation[] = paths.map((p) => {
    const entry = tree.get(p)!;
    const mode = entry.mode === 0o644 ? undefined : entry.mode;
    return {
      op: 'write_file',
      path: p,
      content: entry.content.toString('utf8'),
      ...(mode !== undefined ? { mode } : {}),
      overwrite: true,
    };
  });
  return {
    id,
    category: 'merge-claude-kit',
    title: `Overlay janus .claude/${label}`,
    commit_message: `chore: overlay janus .claude/${label}`,
    preconditions: [],
    operations,
    commit_paths: [...paths],
  };
}

function listEntries(tree: OverlayTree, prefix: string): string[] {
  return [...tree.keys()].filter((p) => p.startsWith(prefix));
}
```

- [ ] **Step 6: Run, verify pass, commit**

```bash
pnpm test:unit -- "steps/merge-claude-kit"
pnpm typecheck
git add src/retrofit/plan-builder/steps/merge-claude-kit.ts src/retrofit/plan-builder/steps/merge-claude-kit.test.ts src/retrofit/plan-builder/steps/settings-base.ts src/retrofit/plan-builder/steps/settings-base.test.ts
git commit -m "feat(retrofit): steps/merge-claude-kit.ts — 5-substep generator + SETTINGS_BASE construction"
```

---

## Task 8: steps/set-package-manager.ts

**Files:**
- Create: `src/retrofit/plan-builder/steps/set-package-manager.ts`
- Create: `src/retrofit/plan-builder/steps/set-package-manager.test.ts`

Single step: delete non-pnpm lockfiles. Omitted if user already on pnpm with no other lockfiles.

- [ ] **Step 1: Write the failing test**

`src/retrofit/plan-builder/steps/set-package-manager.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateSetPackageManagerStep } from './set-package-manager.js';

describe('generateSetPackageManagerStep', () => {
  it('returns null when only pnpm-lock.yaml present', () => {
    expect(generateSetPackageManagerStep(['pnpm-lock.yaml'])).toBeNull();
  });

  it('returns null when no lockfiles', () => {
    expect(generateSetPackageManagerStep([])).toBeNull();
  });

  it('emits delete_file for package-lock.json + yarn.lock', () => {
    const step = generateSetPackageManagerStep(['package-lock.json', 'yarn.lock']);
    expect(step).not.toBeNull();
    expect(step!.id).toBe('set-package-manager');
    expect(step!.operations.map((o) => o.op)).toEqual(['delete_file', 'delete_file']);
    expect(step!.commit_paths.sort()).toEqual(['package-lock.json', 'yarn.lock']);
  });

  it('keeps pnpm-lock.yaml even when other lockfiles present', () => {
    const step = generateSetPackageManagerStep(['pnpm-lock.yaml', 'package-lock.json']);
    expect(step).not.toBeNull();
    expect(step!.operations).toHaveLength(1);
    expect((step!.operations[0] as { path: string }).path).toBe('package-lock.json');
  });
});
```

- [ ] **Step 2: Implement set-package-manager.ts**

`src/retrofit/plan-builder/steps/set-package-manager.ts`:

```ts
import type { Plan } from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

export function generateSetPackageManagerStep(lockfiles_present: string[]): Step | null {
  const toDelete = lockfiles_present.filter((l) => l !== 'pnpm-lock.yaml');
  if (toDelete.length === 0) return null;
  toDelete.sort();
  return {
    id: 'set-package-manager',
    category: 'set-package-manager',
    title: 'Switch to pnpm by removing other lockfiles',
    commit_message: 'chore: switch to pnpm package manager',
    preconditions: [],
    operations: toDelete.map((path) => ({ op: 'delete_file', path })),
    commit_paths: toDelete,
  };
}
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- "steps/set-package-manager"
pnpm typecheck
git add src/retrofit/plan-builder/steps/set-package-manager.ts src/retrofit/plan-builder/steps/set-package-manager.test.ts
git commit -m "feat(retrofit): steps/set-package-manager.ts — non-pnpm lockfile cleanup"
```

---

## Task 9: steps/install-deps.ts

**Files:**
- Create: `src/retrofit/plan-builder/steps/install-deps.ts`
- Create: `src/retrofit/plan-builder/steps/install-deps.test.ts`

Single step: `shell` op `pnpm install`. Skipped entirely when archetype is `monorepo-root`.

- [ ] **Step 1: Write the failing test**

`src/retrofit/plan-builder/steps/install-deps.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateInstallDepsStep } from './install-deps.js';

describe('generateInstallDepsStep', () => {
  it('returns null for monorepo-root', () => {
    expect(generateInstallDepsStep('monorepo-root')).toBeNull();
  });

  it('emits a shell op with pnpm install for other archetypes', () => {
    const step = generateInstallDepsStep('generic-ts');
    expect(step).not.toBeNull();
    expect(step!.id).toBe('install-deps');
    expect(step!.operations).toHaveLength(1);
    const op = step!.operations[0]!;
    expect(op.op).toBe('shell');
    expect((op as { command: string }).command).toBe('pnpm install');
    expect(step!.commit_paths).toEqual(['pnpm-lock.yaml']);
  });
});
```

- [ ] **Step 2: Implement install-deps.ts**

`src/retrofit/plan-builder/steps/install-deps.ts`:

```ts
import type { Plan } from '../../types/index.js';
import { SHELL_WHITELIST } from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

export function generateInstallDepsStep(archetype: string): Step | null {
  if (archetype === 'monorepo-root') return null;
  return {
    id: 'install-deps',
    category: 'install-deps',
    title: 'Install dependencies with pnpm',
    commit_message: 'chore: install dependencies and commit lockfile',
    preconditions: [],
    operations: [
      {
        op: 'shell',
        // 'pnpm install'
        command: SHELL_WHITELIST[0],
        commit_paths: ['pnpm-lock.yaml'],
      },
    ],
    commit_paths: ['pnpm-lock.yaml'],
  };
}
```

Note: `SHELL_WHITELIST[0]` resolves to `'pnpm install'` — the literal-union narrowing keeps the existing test (which asserts `command === 'pnpm install'`) passing without modification.

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- "steps/install-deps"
pnpm typecheck
git add src/retrofit/plan-builder/steps/install-deps.ts src/retrofit/plan-builder/steps/install-deps.test.ts
git commit -m "feat(retrofit): steps/install-deps.ts — pnpm install step with monorepo-root skip"
```

---

## Task 10: steps/write-marker.ts

**Files:**
- Create: `src/retrofit/plan-builder/steps/write-marker.ts`
- Create: `src/retrofit/plan-builder/steps/write-marker.test.ts`

Single step: `write_file` of `.janus.json`. The marker's `applied_steps` and `applied_at` are populated by the executor at runtime — the plan only carries a placeholder content with the slot/plugin/version data.

Plan 4 (executor) replaces the placeholder content with the final marker JSON before writing. Plan 3's job is to emit the step shape; executor fills in dynamic fields.

- [ ] **Step 1: Write the failing test**

`src/retrofit/plan-builder/steps/write-marker.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateWriteMarkerStep } from './write-marker.js';

describe('generateWriteMarkerStep', () => {
  it('emits a write_file op for .janus.json with overwrite: true', () => {
    const step = generateWriteMarkerStep();
    expect(step.id).toBe('write-marker');
    expect(step.category).toBe('write-marker');
    expect(step.commit_paths).toEqual(['.janus.json']);
    const op = step.operations[0]!;
    expect(op.op).toBe('write_file');
    expect((op as { path: string }).path).toBe('.janus.json');
    expect((op as { overwrite?: boolean }).overwrite).toBe(true);
  });
});
```

- [ ] **Step 2: Implement write-marker.ts**

`src/retrofit/plan-builder/steps/write-marker.ts`:

```ts
import type { Plan } from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

// Placeholder content — executor replaces with the actual marker JSON before writing.
// We keep it as an empty JSON object so plan validation passes (write_file.content is a string).
const PLACEHOLDER = '{}';

export function generateWriteMarkerStep(): Step {
  return {
    id: 'write-marker',
    category: 'write-marker',
    title: 'Write .janus.json marker',
    commit_message: 'chore: write janus marker',
    preconditions: [],
    operations: [
      { op: 'write_file', path: '.janus.json', content: PLACEHOLDER, overwrite: true },
    ],
    commit_paths: ['.janus.json'],
  };
}
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- "steps/write-marker"
pnpm typecheck
git add src/retrofit/plan-builder/steps/write-marker.ts src/retrofit/plan-builder/steps/write-marker.test.ts
git commit -m "feat(retrofit): steps/write-marker.ts — placeholder write_file for .janus.json"
```

---

## Task 11: warnings.ts

**Files:**
- Create: `src/retrofit/plan-builder/warnings.ts`
- Create: `src/retrofit/plan-builder/warnings.test.ts`

Cross-cutting warning catalog. `collectWarnings` is a pure function over its inputs (snapshot fields + overlay + archetype + plugins + raw user settings.json). It emits the **ten** warning codes from §5/§6/§6.5/§6.6/§6.7/§8/§9:

| Code | When |
|---|---|
| `MODULE_TYPE_CHANGE` | user `package.json.type` is not `'module'` |
| `PKG_FIELDS_OVERWRITTEN` | user has a `scripts.<name>` entry that janus's package.json sets |
| `WORKFLOW_REFERENCES_DISPLACED_TOOL` | a non-janus workflow references a displaced tool |
| `UNKNOWN_TOOL` | a tool detected in the analyzer that isn't in the recognized allowlist |
| `WARN_OVERWRITE_USER_KIT` | a `.claude/*` baseline file is `present_differs` and the overlay re-writes it |
| `INSTALL_DEPS_MAY_FAIL` | the install-deps step is in the plan (i.e., archetype ≠ monorepo-root) |
| `DEP_VERSION_CONFLICT` | janus pins a devDep range disjoint from the user's pinned range |
| `SETTINGS_PERMISSION_REDUNDANT` | a janus-shipped permission entry is identical to or a strict superset of an existing user entry |
| `SETTINGS_HOOK_CONFLICT` | janus and user both register a hook on the same `(event, matcher)` pair with different commands |
| `SETTINGS_SCALAR_CONFLICT` | a top-level scalar field (`model`, `theme`, `cleanupPeriodDays`, …) is set by the user to a value different from janus's default |

Plan 2 dependency: `ClaudeKitSnapshot` MUST carry a `settings_json?: unknown` field — the parsed contents of `.claude/settings.json` if present. Plan 2's `claude-kit` analyzer already produces this per its file-content snapshot; if a future revision drops it, the implementer of Plan 3 must add it back to `ClaudeKitSnapshot` (forward-reference comment in `warnings.ts`). Plan 3 reads it via `snapshot.claude_kit.settings_json` (Task 12 wiring).

Plan 2 dependency: the analyzer detects `DEP_VERSION_CONFLICT` candidates and exposes them as `RepoSnapshot.dep_version_conflicts: Array<{ name: string; janus_range: string; user_range: string }>` (warning name already in spec §5; Plan 2 owns the detection). `collectWarnings` simply maps these into Warning entries.

- [ ] **Step 1: Write the failing tests**

`src/retrofit/plan-builder/warnings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type {
  BaselineFileStatus,
  ClaudeKitSnapshot,
  OverlayResult,
  OverlayTree,
  PackageJsonSnapshot,
  WorkflowFile,
} from '../types/index.js';
import { collectWarnings } from './warnings.js';

const emptyKit: ClaudeKitSnapshot = {
  has_claude_dir: false,
  has_settings_json: false,
  has_claude_md: false,
  has_pre_janus_md: false,
  hooks: [],
  skills: [],
  misc: [],
};

const baseSnap = (over: Partial<Parameters<typeof collectWarnings>[0]['snapshot']> = {}) => ({
  ci_workflows: [] as WorkflowFile[],
  unrecognized_tools: [] as string[],
  dep_version_conflicts: [] as Array<{ name: string; janus_range: string; user_range: string }>,
  claude_kit: emptyKit,
  ...over,
});

const overlayWith = (paths: string[]): OverlayResult => {
  const tree: OverlayTree = new Map();
  for (const p of paths) tree.set(p, { content: Buffer.from('x'), mode: 0o644 });
  return { tree, gitignore_lines: [], archetype_only: new Set() };
};

describe('collectWarnings — existing four', () => {
  it('emits MODULE_TYPE_CHANGE when user pkg type is commonjs', () => {
    const pkg: PackageJsonSnapshot = { raw: {}, type: 'commonjs' };
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
      package_json: pkg,
    });
    expect(ws.find((w) => w.code === 'MODULE_TYPE_CHANGE')).toBeDefined();
  });

  it('emits MODULE_TYPE_CHANGE when user pkg has no type field', () => {
    const pkg: PackageJsonSnapshot = { raw: { name: 'p' } };
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
      package_json: pkg,
    });
    expect(ws.find((w) => w.code === 'MODULE_TYPE_CHANGE')).toBeDefined();
  });

  it('does NOT emit MODULE_TYPE_CHANGE when user pkg already module', () => {
    const pkg: PackageJsonSnapshot = { raw: {}, type: 'module' };
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
      package_json: pkg,
    });
    expect(ws.find((w) => w.code === 'MODULE_TYPE_CHANGE')).toBeUndefined();
  });

  it('emits PKG_FIELDS_OVERWRITTEN per overwritten script', () => {
    const pkg: PackageJsonSnapshot = {
      raw: {},
      type: 'module',
      scripts: { test: 'jest', lint: 'eslint .' },
    };
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
      package_json: pkg,
    });
    const overrides = ws.filter((w) => w.code === 'PKG_FIELDS_OVERWRITTEN');
    expect(overrides.length).toBeGreaterThanOrEqual(2);
  });

  it('emits WORKFLOW_REFERENCES_DISPLACED_TOOL for non-janus workflows that reference a tool', () => {
    const wf: WorkflowFile[] = [
      { path: '.github/workflows/qa.yml', references_displaced_tool: ['npm', 'eslint'] },
      { path: '.github/workflows/ci.yml', references_displaced_tool: [] },
    ];
    const ws = collectWarnings({
      snapshot: baseSnap({ ci_workflows: wf }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
    });
    const matched = ws.filter((w) => w.code === 'WORKFLOW_REFERENCES_DISPLACED_TOOL');
    expect(matched).toHaveLength(1);
    expect(matched[0]!.evidence).toEqual(['.github/workflows/qa.yml']);
  });

  it('does NOT emit WORKFLOW warning for janus-named workflows (overlay-replaces them)', () => {
    const wf: WorkflowFile[] = [
      { path: '.github/workflows/ci.yml', references_displaced_tool: ['eslint'] },
      { path: '.github/workflows/deploy.yml', references_displaced_tool: ['eslint'] },
    ];
    const ws = collectWarnings({
      snapshot: baseSnap({ ci_workflows: wf }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
    });
    expect(ws.filter((w) => w.code === 'WORKFLOW_REFERENCES_DISPLACED_TOOL')).toHaveLength(0);
  });

  it('emits UNKNOWN_TOOL per unrecognized tool', () => {
    const ws = collectWarnings({
      snapshot: baseSnap({ unrecognized_tools: ['lint-staged', 'turbo'] }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
    });
    expect(ws.filter((w) => w.code === 'UNKNOWN_TOOL')).toHaveLength(2);
  });
});

describe('collectWarnings — WARN_OVERWRITE_USER_KIT', () => {
  it('emits per .claude/* path that is present_differs and present in overlay', () => {
    const baseline: BaselineFileStatus[] = [
      { path: '.claude/skills/foo.md', status: 'present_differs', pre_state_hash: 'sha256:aa' },
      { path: '.claude/hooks/bar.sh', status: 'present_identical', pre_state_hash: 'sha256:bb' },
      { path: 'biome.jsonc', status: 'present_differs', pre_state_hash: 'sha256:cc' },
    ];
    const overlay = overlayWith(['.claude/skills/foo.md', '.claude/hooks/bar.sh', 'biome.jsonc']);
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: baseline,
      overlay,
      archetype: 'monorepo-root',
      plugins: [],
    });
    const overwrites = ws.filter((w) => w.code === 'WARN_OVERWRITE_USER_KIT');
    expect(overwrites).toHaveLength(1);
    expect(overwrites[0]!.evidence).toEqual(['.claude/skills/foo.md']);
  });
});

describe('collectWarnings — INSTALL_DEPS_MAY_FAIL', () => {
  it('emits when archetype !== monorepo-root', () => {
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
    });
    expect(ws.find((w) => w.code === 'INSTALL_DEPS_MAY_FAIL')).toBeDefined();
  });

  it('does NOT emit for monorepo-root', () => {
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
    });
    expect(ws.find((w) => w.code === 'INSTALL_DEPS_MAY_FAIL')).toBeUndefined();
  });
});

describe('collectWarnings — DEP_VERSION_CONFLICT', () => {
  it('emits per analyzer-detected conflict', () => {
    const ws = collectWarnings({
      snapshot: baseSnap({
        dep_version_conflicts: [
          { name: 'typescript', janus_range: '^5.7.0', user_range: '~4.9.0' },
          { name: 'vitest', janus_range: '^3.0.0', user_range: '^1.0.0' },
        ],
      }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
    });
    const conflicts = ws.filter((w) => w.code === 'DEP_VERSION_CONFLICT');
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]!.evidence[0]).toMatch(/^package\.json:devDependencies\./);
  });
});

describe('collectWarnings — SETTINGS_PERMISSION_REDUNDANT', () => {
  it('emits per janus permission identical to user entry', () => {
    const userSettings = {
      permissions: { allow: ['Bash(pnpm *)', 'Read(**)'], deny: ['Bash(rm -rf *)'] },
    };
    const ws = collectWarnings({
      snapshot: baseSnap({ claude_kit: { ...emptyKit, settings_json: userSettings } }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
      user_settings_json: userSettings,
    });
    const reds = ws.filter((w) => w.code === 'SETTINGS_PERMISSION_REDUNDANT');
    // 'Bash(pnpm *)' and 'Read(**)' are both in the janus default + user; expect at least 2.
    expect(reds.length).toBeGreaterThanOrEqual(2);
    expect(reds[0]!.evidence[0]).toMatch(/^\.claude\/settings\.json:permissions\.(allow|deny)$/);
  });
});

describe('collectWarnings — SETTINGS_HOOK_CONFLICT', () => {
  it('emits when user hook command differs from janus on same event', () => {
    const userSettings = {
      hooks: {
        SessionStart: [
          {
            matcher: 'startup|clear|compact',
            hooks: [{ type: 'command', command: '/usr/local/bin/my-session-start.sh' }],
          },
        ],
      },
    };
    const ws = collectWarnings({
      snapshot: baseSnap({ claude_kit: { ...emptyKit, settings_json: userSettings } }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
      user_settings_json: userSettings,
    });
    const conflicts = ws.filter((w) => w.code === 'SETTINGS_HOOK_CONFLICT');
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0]!.evidence[0]).toBe('.claude/settings.json:hooks.SessionStart');
  });
});

describe('collectWarnings — SETTINGS_SCALAR_CONFLICT', () => {
  it('emits per top-level scalar where user differs from janus default', () => {
    const userSettings = { cleanupPeriodDays: 30, theme: 'dark' };
    const ws = collectWarnings({
      snapshot: baseSnap({ claude_kit: { ...emptyKit, settings_json: userSettings } }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
      user_settings_json: userSettings,
    });
    const scalars = ws.filter((w) => w.code === 'SETTINGS_SCALAR_CONFLICT');
    // cleanupPeriodDays differs from janus's default of 7; theme is unset by janus, so
    // it must NOT trigger this warning. Expect exactly one (cleanupPeriodDays).
    expect(scalars).toHaveLength(1);
    expect(scalars[0]!.evidence[0]).toBe('.claude/settings.json:cleanupPeriodDays');
  });
});
```

- [ ] **Step 2: Implement warnings.ts**

`src/retrofit/plan-builder/warnings.ts`:

```ts
import type {
  Archetype,
  BaselineFileStatus,
  ClaudeKitSnapshot,
  OverlayResult,
  PackageJsonSnapshot,
  Plan,
  RepoSnapshot,
  WorkflowFile,
} from '../types/index.js';
import { buildSettingsBase, type SettingsBase } from './steps/settings-base.js';

type Warning = Plan['payload']['warnings'][number];

// Scripts janus's templates set (matches scaffold.sh + _shared/package.json.tmpl).
const JANUS_SCRIPTS = new Set([
  'lint',
  'format',
  'check',
  'build',
  'test',
  'dev',
  'deploy:staging',
  'deploy:prod',
  'prepare',
]);

// Workflow files janus ships (overlay-replaced; warnings here would be redundant with WARN_OVERWRITE_USER_KIT).
const JANUS_WORKFLOWS = new Set([
  '.github/workflows/ci.yml',
  '.github/workflows/deploy.yml',
  '.github/workflows/infra-preview.yml',
  '.github/workflows/claude-autofix.yml',
]);

export type CollectWarningsInput = {
  snapshot: Omit<RepoSnapshot, 'baseline_files'>;
  baseline_files: BaselineFileStatus[];
  overlay: OverlayResult;
  archetype: Archetype;
  plugins: string[];
  /** raw parsed user settings.json (undefined if absent). Mirrors snapshot.claude_kit.settings_json. */
  user_settings_json?: unknown;
  /** Optional convenience pass-through for MODULE_TYPE_CHANGE / PKG_FIELDS_OVERWRITTEN. */
  package_json?: PackageJsonSnapshot;
};

export function collectWarnings(input: CollectWarningsInput): Warning[] {
  const ws: Warning[] = [];
  const pkg = input.package_json ?? input.snapshot.package_json;

  // -------- MODULE_TYPE_CHANGE --------
  if (pkg && pkg.type !== 'module') {
    const from = pkg.type ?? 'unset';
    ws.push({
      code: 'MODULE_TYPE_CHANGE',
      message: `package.json type will change from '${from}' to 'module'`,
      evidence: ['package.json:type'],
    });
  }

  // -------- PKG_FIELDS_OVERWRITTEN --------
  if (pkg?.scripts) {
    for (const [name, value] of Object.entries(pkg.scripts)) {
      if (JANUS_SCRIPTS.has(name)) {
        ws.push({
          code: 'PKG_FIELDS_OVERWRITTEN',
          message: `package.json:scripts.${name} will be overwritten ('${value}' → janus version)`,
          evidence: [`package.json:scripts.${name}`],
        });
      }
    }
  }

  // -------- WORKFLOW_REFERENCES_DISPLACED_TOOL --------
  for (const wf of input.snapshot.ci_workflows ?? []) {
    if (JANUS_WORKFLOWS.has(wf.path)) continue;
    if (wf.references_displaced_tool.length === 0) continue;
    ws.push({
      code: 'WORKFLOW_REFERENCES_DISPLACED_TOOL',
      message: `${wf.path} references displaced tool(s): ${wf.references_displaced_tool.join(', ')}`,
      evidence: [wf.path],
    });
  }

  // -------- UNKNOWN_TOOL --------
  for (const t of input.snapshot.unrecognized_tools ?? []) {
    ws.push({
      code: 'UNKNOWN_TOOL',
      message: `${t} detected; not migrated`,
      evidence: [`package.json:devDependencies.${t}`],
    });
  }

  // -------- WARN_OVERWRITE_USER_KIT --------
  // For each .claude/* baseline that is present_differs AND in the overlay tree, emit one warning.
  for (const b of input.baseline_files) {
    if (!b.path.startsWith('.claude/')) continue;
    if (b.status !== 'present_differs') continue;
    if (!input.overlay.tree.has(b.path)) continue;
    ws.push({
      code: 'WARN_OVERWRITE_USER_KIT',
      message: `.claude/${b.path.slice('.claude/'.length)} will be overwritten by janus version`,
      evidence: [b.path],
    });
  }

  // -------- INSTALL_DEPS_MAY_FAIL --------
  if (input.archetype !== 'monorepo-root') {
    ws.push({
      code: 'INSTALL_DEPS_MAY_FAIL',
      message:
        'pnpm install may fail on peer-dep / registry / network issues; lockfile and node_modules left dirty if so',
      evidence: [],
    });
  }

  // -------- DEP_VERSION_CONFLICT --------
  for (const c of input.snapshot.dep_version_conflicts ?? []) {
    ws.push({
      code: 'DEP_VERSION_CONFLICT',
      message: `${c.name}: janus pins ${c.janus_range}, user has ${c.user_range} (no overlap)`,
      evidence: [`package.json:devDependencies.${c.name}`],
    });
  }

  // -------- SETTINGS_* (only when the user has a settings.json to compare against) --------
  const userSettings = (input.user_settings_json ?? input.snapshot.claude_kit?.settings_json) as
    | Record<string, unknown>
    | undefined;
  if (userSettings && typeof userSettings === 'object') {
    // Use a representative SETTINGS_BASE — we only need janus's defaults to compare against the user's.
    // Workload + plugins do not affect the keys we compare.
    const janus = buildSettingsBase({ workload: '_compare_', plugins: input.plugins });
    ws.push(...settingsPermissionRedundancies(janus, userSettings));
    ws.push(...settingsHookConflicts(janus, userSettings));
    ws.push(...settingsScalarConflicts(janus, userSettings));
  }

  return ws;
}

function settingsPermissionRedundancies(
  janus: SettingsBase,
  user: Record<string, unknown>,
): Warning[] {
  const out: Warning[] = [];
  const userPerms = (user.permissions as { allow?: string[]; deny?: string[] } | undefined) ?? {};
  for (const kind of ['allow', 'deny'] as const) {
    const userList = userPerms[kind] ?? [];
    const janusList = janus.permissions?.[kind] ?? [];
    for (const j of janusList) {
      const match = userList.find((u) => u === j || isStrictSuperset(u, j));
      if (match !== undefined) {
        out.push({
          code: 'SETTINGS_PERMISSION_REDUNDANT',
          message: `${j} is redundant with existing ${match}`,
          evidence: [`.claude/settings.json:permissions.${kind}`],
        });
      }
    }
  }
  return out;
}

/**
 * Strict-superset check for permission patterns. Conservative: returns true when `user`
 * differs from `janus` only by widening one or more glob segments to `**`. Anything more
 * exotic falls back to false (no warning emitted — false negatives are acceptable here).
 */
function isStrictSuperset(user: string, janus: string): boolean {
  if (user === janus) return false;
  const u = user.replaceAll('**', '');
  const j = janus.replaceAll('**', '');
  // Cheap textual heuristic: if user contains '' where janus has a literal segment,
  // and the rest matches, treat as superset.
  return u.includes('') && j.split('').every((seg) => user.includes(seg));
}

function settingsHookConflicts(janus: SettingsBase, user: Record<string, unknown>): Warning[] {
  const out: Warning[] = [];
  const userHooks =
    (user.hooks as Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>
    | undefined) ?? {};
  const janusHooks = janus.hooks ?? {};
  for (const [event, janusEntries] of Object.entries(janusHooks)) {
    const userEntries = userHooks[event] ?? [];
    for (const je of janusEntries) {
      for (const ue of userEntries) {
        const sameMatcher = (je.matcher ?? '') === (ue.matcher ?? '');
        if (!sameMatcher) continue;
        const jcmd = je.hooks[0]?.command ?? '';
        const ucmd = ue.hooks[0]?.command ?? '';
        if (jcmd && ucmd && basename(jcmd) !== basename(ucmd)) {
          out.push({
            code: 'SETTINGS_HOOK_CONFLICT',
            message: `janus hook ${jcmd} conflicts with user hook ${ucmd} on event ${event}; keeping user`,
            evidence: [`.claude/settings.json:hooks.${event}`],
          });
        }
      }
    }
  }
  return out;
}

function basename(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function settingsScalarConflicts(janus: SettingsBase, user: Record<string, unknown>): Warning[] {
  const out: Warning[] = [];
  const SCALAR_FIELDS: Array<keyof SettingsBase> = ['cleanupPeriodDays'];
  for (const field of SCALAR_FIELDS) {
    const j = (janus as Record<string, unknown>)[field as string];
    const u = user[field as string];
    if (j === undefined) continue; // janus does not set this field — no conflict
    if (u === undefined) continue; // user has not set it — janus value applies
    if (u === j) continue;
    out.push({
      code: 'SETTINGS_SCALAR_CONFLICT',
      message: `${String(field)}: user value ${JSON.stringify(u)} preserved; janus default ${JSON.stringify(j)} not applied`,
      evidence: [`.claude/settings.json:${String(field)}`],
    });
  }
  return out;
}
```

Notes for the implementer:

- `WorkflowFile`, `BaselineFileStatus`, `OverlayResult`, `Archetype`, `RepoSnapshot.dep_version_conflicts`, and `ClaudeKitSnapshot.settings_json` are all assumed to exist on Plan 1 / Plan 2's surface. If `dep_version_conflicts` or `settings_json` is missing from the current types barrel when you start implementing, add a `// TODO(plan-2): ensure ClaudeKitSnapshot.settings_json is populated by analyzer` comment and a typecheck-failing reference to make the dependency loud, then push the fix into Plan 2.
- The `SCALAR_FIELDS` list intentionally starts with only `cleanupPeriodDays` — the only scalar `buildSettingsBase` currently emits. Add `model` / `theme` / etc. when janus's `SETTINGS_BASE` grows them.
- `isStrictSuperset` is a deliberately cheap heuristic. False negatives (no warning when one would be technically valid) are acceptable; false positives (warning when patterns are actually disjoint) would be noisy. The test exercises only the identical-string path; the superset path is best-effort.

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test src/retrofit/plan-builder/warnings.test.ts
pnpm typecheck
git add src/retrofit/plan-builder/warnings.ts src/retrofit/plan-builder/warnings.test.ts
git commit -m "feat(plan-builder): add WARN_OVERWRITE_USER_KIT, INSTALL_DEPS_MAY_FAIL, DEP_VERSION_CONFLICT, SETTINGS_* warnings"
```

Expected: PASS. Each of the ten codes (`MODULE_TYPE_CHANGE`, `PKG_FIELDS_OVERWRITTEN`, `WORKFLOW_REFERENCES_DISPLACED_TOOL`, `UNKNOWN_TOOL`, `WARN_OVERWRITE_USER_KIT`, `INSTALL_DEPS_MAY_FAIL`, `DEP_VERSION_CONFLICT`, `SETTINGS_PERMISSION_REDUNDANT`, `SETTINGS_HOOK_CONFLICT`, `SETTINGS_SCALAR_CONFLICT`) has at least one passing test case. The implementer must verify this coverage explicitly before committing — if a code is unreached, add a fixture for it.

---

## Task 12: plan-builder/index.ts (compose buildPlan())

**Files:**
- Create: `src/retrofit/plan-builder/index.ts`
- Create: `src/retrofit/plan-builder/index.test.ts`

The pure-function entry. Composes step generators, applies idempotency omission, drops empty steps, sorts deterministically, attaches sorted warnings + slots + plugins + meta. Returns a `Plan` that validates against `plan.schema.json`.

- [ ] **Step 1: Write failing tests**

`src/retrofit/plan-builder/index.test.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { afterEach } from 'vitest';
import { analyze } from '../analyzer/index.js';
import { baselineDiff } from '../analyzer/baseline-diff.js';
import { resolvePlugins } from '../resolvers/plugins.js';
import { resolveSlots } from '../resolvers/slots.js';
import { validatePlan } from '../schema/validate.js';
import { materializeFixture } from '../../../tests/helpers/fixture-repo.js';
import { execSync } from 'node:child_process';
import { buildPlan } from './index.js';
import { buildOverlayTree } from './overlay-tree.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const JANUS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

describe('buildPlan', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('returns a Plan that validates against plan.schema.json (greenfield + generic-ts)', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan = await buildEndToEnd(fx.dir, 'generic-ts');
    const result = validatePlan(plan);
    expect(result.ok).toBe(true);
  });

  it('contains expected categories for an eslint-only repo', async () => {
    const fx = materializeFixture('eslint-only');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan = await buildEndToEnd(fx.dir, 'generic-ts');
    const cats = new Set(plan.payload.steps.map((s) => s.category));
    expect(cats).toContain('displace-tools');
    expect(cats).toContain('apply-shared-overlay');
    expect(cats).toContain('install-deps');
    expect(cats).toContain('write-marker');
  });

  it('skips install-deps for monorepo-root archetype', async () => {
    const fx = materializeFixture('monorepo');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan = await buildEndToEnd(fx.dir, 'monorepo-root');
    expect(plan.payload.steps.find((s) => s.id === 'install-deps')).toBeUndefined();
  });

  it('produces byte-stable payload across two runs (determinism contract)', async () => {
    const fx = materializeFixture('eslint-only');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan1 = await buildEndToEnd(fx.dir, 'generic-ts');
    const plan2 = await buildEndToEnd(fx.dir, 'generic-ts');
    expect(JSON.stringify(plan1.payload)).toBe(JSON.stringify(plan2.payload));
  });
});

async function buildEndToEnd(repoRoot: string, archetype: string) {
  const snapshot = analyze(repoRoot);
  const slots = await resolveSlots({
    snapshot,
    archetype,
    cliSlots: { author: 'T', author_email: 't@e.com', description: 'd' },
    nonInteractive: true,
    now: new Date('2026-05-05T00:00:00Z'),
    janusVersion: '0.1.0',
  });
  const plugins = await resolvePlugins({
    pluginEvidence: snapshot.plugin_evidence,
    cliAdd: [],
    cliRemove: [],
    nonInteractive: true,
  });
  const overlay = buildOverlayTree(JANUS_ROOT, archetype, slots);
  const baseline = baselineDiff(repoRoot, overlay.tree);
  const fullSnapshot = { ...snapshot, baseline_files: baseline };
  return buildPlan({
    snapshot: fullSnapshot,
    overlay,
    slots,
    plugins,
    archetype,
    janusVersion: '0.1.0',
    targetBranch: 'janus/retrofit',
    now: new Date('2026-05-05T00:00:00Z'),
    has_user_gitignore: existsSync(join(repoRoot, '.gitignore')),
  });
}
```

- [ ] **Step 2: Implement plan-builder/index.ts**

`src/retrofit/plan-builder/index.ts`:

```ts
import type {
  Operation,
  Plan,
  RepoSnapshot,
  Sha256,
} from '../types/index.js';
import { sortSteps, sortWarnings } from './determinism.js';
import { shouldEmit } from './idempotency.js';
import type { OverlayResult } from './overlay-tree.js';
import { generateApplyArchetypeOverlaySteps } from './steps/apply-archetype-overlay.js';
import { generateApplySharedOverlaySteps } from './steps/apply-shared-overlay.js';
import { generateDisplaceToolsSteps } from './steps/displace-tools.js';
import { generateInstallDepsStep } from './steps/install-deps.js';
import { generateMergeClaudeKitSteps } from './steps/merge-claude-kit.js';
import { generateSetPackageManagerStep } from './steps/set-package-manager.js';
import { generateWriteMarkerStep } from './steps/write-marker.js';
import { collectWarnings } from './warnings.js';

export type BuildPlanInput = {
  snapshot: RepoSnapshot;
  overlay: OverlayResult;
  slots: Record<string, string>;
  plugins: string[];
  archetype: string;
  janusVersion: string;
  targetBranch: string;
  now: Date;
  has_user_gitignore: boolean;
};

export function buildPlan(input: BuildPlanInput): Plan {
  const { snapshot, overlay, slots, plugins, archetype, janusVersion, targetBranch, now } = input;

  // Step generators (raw, pre-idempotency).
  const rawSteps: Plan['payload']['steps'] = [];

  rawSteps.push(...generateDisplaceToolsSteps(snapshot.displaced_tools));

  const setPm = generateSetPackageManagerStep(snapshot.lockfiles_present);
  if (setPm) rawSteps.push(setPm);

  rawSteps.push(
    ...generateApplySharedOverlaySteps(overlay.tree, snapshot.baseline_files, {
      has_user_gitignore: input.has_user_gitignore,
      gitignore_lines: overlay.gitignore_lines,
    }),
  );

  // Archetype-only entries are tagged at construction time by Plan 2's overlay-tree builder
  // and exposed on `OverlayResult.archetype_only`. Plan 3 consumes the set directly — no
  // recompute, no helper.
  rawSteps.push(
    ...generateApplyArchetypeOverlaySteps(overlay.tree, snapshot.baseline_files, overlay.archetype_only),
  );

  // Pre-state hashes for claude_settings_merge / claude_md_snapshot from baseline.
  const settingsBaseline = snapshot.baseline_files.find((b) => b.path === '.claude/settings.json');
  const claudeMdBaseline = snapshot.baseline_files.find((b) => b.path === 'CLAUDE.md');

  rawSteps.push(
    ...generateMergeClaudeKitSteps(overlay.tree, snapshot.claude_kit, {
      workload: slots.workload!,
      plugins,
      settings_pre_state_hash: settingsBaseline?.pre_state_hash as Sha256 | undefined,
      claude_md_pre_state_hash: claudeMdBaseline?.pre_state_hash as Sha256 | undefined,
    }),
  );

  const installDeps = generateInstallDepsStep(archetype);
  if (installDeps) rawSteps.push(installDeps);

  rawSteps.push(generateWriteMarkerStep());

  // Per-op omission rule (§6.8).
  const filteredSteps = rawSteps
    .map((step) => ({
      ...step,
      operations: step.operations.filter((op) => shouldEmit(op, {
        baseline_files: snapshot.baseline_files,
        package_json: snapshot.package_json,
      })),
    }))
    .filter((step) => step.operations.length > 0);

  // Sort steps (cross-category numeric, within-category alphabetical).
  const steps = sortSteps(filteredSteps).map((s) => ({
    ...s,
    operations: s.operations as Operation[],
    commit_paths: [...s.commit_paths].sort(),
  }));

  // Warnings. `collectWarnings` is a pure function over snapshot + overlay + archetype + plugins
  // + raw user settings.json. The user_settings_json read pulls from
  // `snapshot.claude_kit.settings_json` (Plan 2 dependency — `ClaudeKitSnapshot.settings_json`
  // MUST exist; per Plan 2's claude-kit module it does, but if a future revision removes it,
  // this line will fail to typecheck and that's the signal to push the fix back into Plan 2).
  const { baseline_files: _drop, ...snapshotWithoutBaseline } = snapshot;
  const warnings = sortWarnings(
    collectWarnings({
      snapshot: snapshotWithoutBaseline,
      baseline_files: snapshot.baseline_files,
      overlay,
      archetype: archetype as Plan['payload']['archetype'],
      plugins,
      user_settings_json: snapshot.claude_kit.settings_json,
      package_json: snapshot.package_json,
    }),
  );

  return {
    schema_version: '1',
    meta: {
      janus_version: janusVersion,
      generated_at: now.toISOString(),
    },
    payload: {
      repo_root: snapshot.repo_root,
      archetype,
      target_branch: targetBranch,
      slots: slots as Plan['payload']['slots'],
      plugins,
      prior_marker: snapshot.prior_marker ?? null,
      warnings,
      steps,
    },
  };
}
```

**Note for the implementer:** `archetype_only` is owned and populated by Plan 2's `buildOverlayTree` and exposed on `OverlayResult`. Plan 3 simply consumes `overlay.archetype_only` — no helper, no reach-back patch. If you find that field missing on `OverlayResult` while implementing this task, push the fix into Plan 2's overlay-tree task; do NOT introduce a placeholder set here.

- [ ] **Step 3: Run all plan-builder tests, verify pass**

```bash
pnpm test:unit -- "plan-builder"
```
Expected: PASS — all existing + new tests.

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/plan-builder/index.ts src/retrofit/plan-builder/index.test.ts
git commit -m "feat(retrofit): plan-builder/index.ts — compose generators, idempotency, sort, consume overlay.archetype_only"
```

---

## Task 13: diagnose.ts (orchestrator) + per-archetype determinism integration test

**Files:**
- Create: `src/retrofit/plan-builder/diagnose.ts`
- Create: `tests/integration/plan3-determinism.test.ts`

`diagnose.ts` is the public entry that ties analyzer + resolvers + overlay + baseline-diff + buildPlan + JSON write together. It does NOT parse CLI args (Plan 5) and does NOT prompt (Plan 5 wires up the prompt callback).

The determinism test runs `diagnose()` twice on each fixture × archetype combination and asserts byte-identical `payload`.

- [ ] **Step 1: Implement diagnose.ts**

`src/retrofit/plan-builder/diagnose.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../analyzer/index.js';
import { baselineDiff } from '../analyzer/baseline-diff.js';
import { resolvePlugins } from '../resolvers/plugins.js';
import { resolveSlots, type SlotKey } from '../resolvers/slots.js';
import type { Plan } from '../types/index.js';
import { buildPlan } from './index.js';
import { buildOverlayTree } from './overlay-tree.js';

const DEFAULT_JANUS_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export type DiagnoseOpts = {
  repoRoot: string;
  archetype: string;
  janusRoot?: string;
  janusVersion?: string;
  targetBranch?: string;
  now?: Date;
  cliSlots?: Partial<Record<SlotKey, string>>;
  cliPluginAdd?: string[];
  cliPluginRemove?: string[];
  nonInteractive?: boolean;
  prompt?: (key: SlotKey) => Promise<string>;
  confirmPlugins?: (proposed: string[]) => Promise<string[]>;
  /** If supplied, write the plan JSON here. Otherwise return without writing. */
  outPath?: string;
  /**
   * Forwarded verbatim to `analyze(repoRoot, { unrecognizedToolsAllowlist })`.
   * When omitted, the analyzer falls back to its hardcoded starter list.
   * Plan 5's CLI loads this via `loadUnrecognizedToolsAllowlist(janusRoot)`
   * (Plan 2) before calling `diagnose`.
   */
  unrecognizedToolsAllowlist?: string[];
};

export async function diagnose(opts: DiagnoseOpts): Promise<Plan> {
  const janusRoot = opts.janusRoot ?? DEFAULT_JANUS_ROOT;
  const janusVersion = opts.janusVersion ?? '0.1.0';
  const targetBranch = opts.targetBranch ?? 'janus/retrofit';
  const now = opts.now ?? new Date();

  const snapshot = analyze(opts.repoRoot, {
    ...(opts.unrecognizedToolsAllowlist ? { unrecognizedToolsAllowlist: opts.unrecognizedToolsAllowlist } : {}),
  });

  const slots = await resolveSlots({
    snapshot,
    archetype: opts.archetype,
    cliSlots: opts.cliSlots ?? {},
    nonInteractive: opts.nonInteractive ?? true,
    janusVersion,
    now,
    ...(opts.prompt ? { prompt: opts.prompt } : {}),
  });

  const plugins = await resolvePlugins({
    priorMarker: snapshot.prior_marker,
    pluginEvidence: snapshot.plugin_evidence,
    cliAdd: opts.cliPluginAdd ?? [],
    cliRemove: opts.cliPluginRemove ?? [],
    nonInteractive: opts.nonInteractive ?? true,
    ...(opts.confirmPlugins ? { confirm: opts.confirmPlugins } : {}),
  });

  const overlay = buildOverlayTree(janusRoot, opts.archetype, slots);
  const baseline = baselineDiff(opts.repoRoot, overlay.tree);
  const fullSnapshot = { ...snapshot, baseline_files: baseline };
  const has_user_gitignore = existsSync(join(opts.repoRoot, '.gitignore'));

  const plan = buildPlan({
    snapshot: fullSnapshot,
    overlay,
    slots,
    plugins,
    archetype: opts.archetype,
    janusVersion,
    targetBranch,
    now,
    has_user_gitignore,
  });

  if (opts.outPath) {
    writeFileSync(opts.outPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  }
  return plan;
}
```

- [ ] **Step 2: Determinism integration test**

`tests/integration/plan3-determinism.test.ts`:

```ts
import { execSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { diagnose } from '../../src/retrofit/plan-builder/diagnose.js';
import { hashPayload } from '../../src/retrofit/plan-builder/determinism.js';
import { validatePlan } from '../../src/retrofit/schema/validate.js';
import { materializeFixture } from '../helpers/fixture-repo.js';

const CASES: Array<{ fixture: string; archetype: string }> = [
  { fixture: 'greenfield', archetype: 'generic-ts' },
  { fixture: 'eslint-only', archetype: 'generic-ts' },
  { fixture: 'prettier-husky', archetype: 'generic-ts' },
  { fixture: 'monorepo', archetype: 'monorepo-root' },
  { fixture: 'commonjs-repo', archetype: 'generic-ts' },
];

describe('Plan 3 determinism: per fixture × archetype', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  for (const { fixture, archetype } of CASES) {
    it(`${fixture} + ${archetype}: schema-valid + payload byte-stable across two runs`, async () => {
      const fx = materializeFixture(fixture);
      cleanups.push(fx.cleanup);
      execSync(`git remote add origin https://github.com/test-org/${fixture.replace(/[-_]/g, '')}.git`, {
        cwd: fx.dir,
        stdio: 'pipe',
      });
      const cliSlots = {
        author: 'Test',
        author_email: 'test@example.com',
        description: 'A test',
      };
      const now = new Date('2026-05-05T00:00:00Z');
      const plan1 = await diagnose({ repoRoot: fx.dir, archetype, cliSlots, now });
      const plan2 = await diagnose({ repoRoot: fx.dir, archetype, cliSlots, now });

      expect(validatePlan(plan1).ok).toBe(true);
      expect(hashPayload(plan1.payload)).toBe(hashPayload(plan2.payload));
    });
  }

  it('apply-shared-overlay/root-dotfiles strictly precedes install-deps (load-bearing ordering)', async () => {
    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan = await diagnose({
      repoRoot: fx.dir,
      archetype: 'generic-ts',
      cliSlots: { author: 'T', author_email: 't@e.com', description: 'd' },
      now: new Date('2026-05-05T00:00:00Z'),
    });
    const ids = plan.payload.steps.map((s) => s.id);
    const dotfilesIdx = ids.indexOf('root-dotfiles');
    const installIdx = ids.indexOf('install-deps');
    expect(dotfilesIdx).toBeGreaterThanOrEqual(0);
    expect(installIdx).toBeGreaterThan(dotfilesIdx);
  });

  it('set-package-manager strictly precedes install-deps when present', async () => {
    const fx = materializeFixture('npm-with-jest');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test-org/foo.git', {
      cwd: fx.dir,
      stdio: 'pipe',
    });
    const plan = await diagnose({
      repoRoot: fx.dir,
      archetype: 'generic-ts',
      cliSlots: { author: 'T', author_email: 't@e.com', description: 'd' },
      now: new Date('2026-05-05T00:00:00Z'),
    });
    const ids = plan.payload.steps.map((s) => s.id);
    const setIdx = ids.indexOf('set-package-manager');
    const installIdx = ids.indexOf('install-deps');
    expect(setIdx).toBeGreaterThanOrEqual(0);
    expect(installIdx).toBeGreaterThan(setIdx);
  });
});
```

- [ ] **Step 3: Run, verify pass**

Run: `pnpm test:unit -- plan3-determinism`
Expected: PASS — 7/7 (5 fixture × archetype determinism + 2 step-ordering).

- [ ] **Step 4: Typecheck + commit**

```bash
pnpm typecheck
git add src/retrofit/plan-builder/diagnose.ts tests/integration/plan3-determinism.test.ts
git commit -m "feat(retrofit): plan-builder/diagnose.ts orchestrator + determinism integration test"
```

---

## Task 14: Final sanity — Plan 3 close-out

**Files:**
- Modify: any biome formatting fixups.

- [ ] **Step 1: Run full suite**

Run: `pnpm test`
Expected: PASS — Plans 1+2+3 tests all green plus bash smoke tests.

- [ ] **Step 2: Clean build + typecheck + pack**

```bash
rm -rf dist .tsbuildinfo
pnpm build && pnpm typecheck
pnpm pack --dry-run
```
Expected: tarball includes `dist/retrofit/plan-builder/` with index, diagnose, determinism, idempotency, warnings, overlay-tree, exclude, jq-merge, render-mo + steps/* files.

- [ ] **Step 3: Biome fixups + commit if needed**

```bash
pnpm check
git status
git add -A && git commit -m "chore(retrofit): biome formatting fixups for Plan 3"   # if diff
```

Plan 3 complete. End state:
- `buildPlan(...)` produces valid `Plan` JSON for every fixture×archetype combination.
- `payload` is byte-stable across runs (proved by 5+ test cases).
- Step ordering enforces `root-dotfiles → install-deps` and `set-package-manager → install-deps` invariants.
- Warnings catalog covers all ten codes: MODULE_TYPE_CHANGE, PKG_FIELDS_OVERWRITTEN, WORKFLOW_REFERENCES_DISPLACED_TOOL, UNKNOWN_TOOL, WARN_OVERWRITE_USER_KIT, INSTALL_DEPS_MAY_FAIL, DEP_VERSION_CONFLICT, SETTINGS_PERMISSION_REDUNDANT, SETTINGS_HOOK_CONFLICT, SETTINGS_SCALAR_CONFLICT.
- `diagnose()` orchestrator wires it all end-to-end without CLI parsing.

---

## Self-review checklist

1. **Spec coverage:**
   - §6.6 categories 1–7 → step generators in Tasks 3–10
   - §6.6 ordering rules → `determinism.ts` Task 2
   - §6.6.5 archetype-vs-displaced-tools constraint → assertion in apply-archetype-overlay Task 6
   - §6.6 WARN_OVERWRITE_USER_KIT → `warnings.ts` Task 11 (lands here, **not deferred to Plan 4**)
   - §6.7 WORKFLOW warning emission → warnings.ts Task 11
   - §6.8 per-op omission → idempotency.ts Task 1
   - §7 schema validation → end-to-end test Task 12 (validatePlan after buildPlan)
   - §7 determinism contract → integration test Task 13
   - §8 SETTINGS_BASE construction → settings-base.ts Task 7
   - §8 SETTINGS_PERMISSION_REDUNDANT / SETTINGS_HOOK_CONFLICT / SETTINGS_SCALAR_CONFLICT → `warnings.ts` Task 11 (lands here, **not deferred to Plan 4**)
   - §6.5 DEP_VERSION_CONFLICT → `warnings.ts` Task 11 (analyzer detects, plan-builder emits — **not deferred to Plan 4**)
   - §9 INSTALL_DEPS_MAY_FAIL → `warnings.ts` Task 11 (lands here, **not deferred to Plan 4**)

2. **Out-of-scope discipline:** No executor mutation, no CLI argv parsing, no real prompt UI. `bin/janus.js` untouched. No retroactive edits to Plan 2's `overlay-tree.ts` (Plan 2 owns `OverlayResult.archetype_only` outright; Plan 3 only consumes it).

3. **Deferred items intentionally documented:**
   - `commit_message` for some steps may be cosmetically improved during dogfooding. v0.1 uses the `chore: <verb>` style throughout per §7.
   - The six warnings previously deferred to Plan 4 (`WARN_OVERWRITE_USER_KIT`, `INSTALL_DEPS_MAY_FAIL`, `DEP_VERSION_CONFLICT`, `SETTINGS_PERMISSION_REDUNDANT`, `SETTINGS_HOOK_CONFLICT`, `SETTINGS_SCALAR_CONFLICT`) are now emitted in Plan 3's `warnings.ts`. Plan 4 may surface them in pre-flight UX but does not own emission.

4. **Type consistency:** every step generator returns `Plan['payload']['steps'][number]`. Operation types match the schema discriminated union. `SlotMap` shape matches `Plan['payload']['slots']`. `SHELL_WHITELIST[i]` literal-narrowing keeps every `op: 'shell'` typed as the exact whitelist entry — no `string` widening at emit sites.

---

## Plan 4 preview (do not execute as part of Plan 3)

Plan 4 lands the executor:

- `src/retrofit/executor/preflight.ts` — pre-flight checks #1–#16 from §4
- `src/retrofit/executor/operations/` — one handler per op kind (write_file, delete_file, delete_directory, rename_file, chmod, json_set, json_remove, json_remove_matching, json_merge, claude_settings_merge, gitignore_merge, shell)
- `src/retrofit/executor/git.ts` — branch creation, status checks, commit per step
- `src/retrofit/executor/index.ts` — `execute(plan, repoRoot, opts)` main loop
- `--dry-run` mode (run pre-flight, list steps, exit without mutation)
- Final marker write (executor replaces the placeholder content from Plan 3's `write-marker` step with the real `JanusMarker` JSON)
- Run report struct with last-good SHA on abort
- ~30+ tests including the `pre_state_hash` TOCTOU test and `EXTRANEOUS_FILE_MODIFICATIONS` detection
