# janus retrofit — Plan 5 of 5: CLI Wiring + Prompt UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface `diagnose` and `retrofit` as `npx @pantheon-tech/janus` subcommands, wire interactive prompts to the slot/plugin resolvers, format the human-readable summaries, and read the unrecognized-tools allowlist from `docs/conventions/dependencies.md`.

**Architecture:** `bin/janus.js` (plain JS, dispatches to bash today) gets two new commands that delegate to TypeScript-compiled CLI modules under `src/retrofit/cli/`. The CLI modules own argv parsing (no external arg-parser dep — minimist-shaped manual parser), the prompt callbacks (stdin via `node:readline`), the stdout summary formatters, and the docs-conventions allowlist reader. Plan 4's `execute()` and Plan 3's `diagnose()` are the engines; Plan 5 is the shell.

**Tech Stack:** Node 24 `node:readline` for prompts. No new runtime deps. The existing `dist/retrofit/` (built by Plan 1's TypeScript pipeline) ships everything needed; `bin/janus.js` does dynamic `import('../dist/retrofit/cli/...')` after `pnpm build` runs.

**Out of scope for Plan 5:** Any drift from spec §11 CLI surface. Documentation updates outside the strict needs of Plan 5 (CHANGELOG entry yes; rewriting AGENTS.md no). The dogfood-on-real-repos manual smoke tests are tracked but not test-gated.

---

## Spec coverage map

| Spec § | Plan 5 deliverable |
|---|---|
| §11 `janus diagnose` argv | `cli/diagnose-cmd.ts` (Tasks 2–3) |
| §11 `janus retrofit` argv | `cli/retrofit-cmd.ts` (Task 5) |
| §11 diagnose stdout summary | `cli/format-diagnose-summary.ts` (Task 4) |
| §11 retrofit stdout summary | `cli/format-retrofit-summary.ts` (Task 6) |
| §5a interactive slot prompt | `cli/prompt.ts` (Task 1) |
| §5b plugin confirmation | `cli/prompt.ts` (Task 1) |
| §5 unrecognized_tools allowlist source | `cli/unrecognized-tools.ts` (Task 7) |
| §11 `--branch` collision suggestion + soft-fail | wired in `retrofit-cmd.ts` (Task 5) |
| §11 `--dry-run` summary | `retrofit-cmd.ts` calls executor with `dryRun: true` (Task 5) |
| §13 windows out-of-scope (CLI exits early on win32) | `cli/diagnose-cmd.ts` and `retrofit-cmd.ts` first-line check |

---

## File structure

```
src/retrofit/cli/
├── argparse.ts                      — minimist-shaped parser (no external dep)
├── prompt.ts                        — readline-based slot + plugin prompts
├── unrecognized-tools.ts            — read allowlist from docs/conventions/dependencies.md
├── format-diagnose-summary.ts       — §11 diagnose stdout
├── format-retrofit-summary.ts       — §11 retrofit success stdout
├── diagnose-cmd.ts                  — `janus diagnose` entry: argparse → diagnose() → write JSON → print summary
└── retrofit-cmd.ts                  — `janus retrofit` entry: argparse → load plan → execute() → print summary

bin/janus.js                          — adds `diagnose` and `retrofit` to COMMANDS map (dynamic import pattern)

docs/conventions/dependencies.md     — adds `## Unrecognized tools (retrofit warning allowlist)` section
```

---

## Task 1: cli/argparse.ts + cli/prompt.ts

**Files:**
- Create: `src/retrofit/cli/argparse.ts`
- Create: `src/retrofit/cli/argparse.test.ts`
- Create: `src/retrofit/cli/prompt.ts`
- Create: `src/retrofit/cli/prompt.test.ts`

A small purpose-built arg parser supporting: long flags (`--flag`), valued flags (`--key value` and `--key=value`), and repeatable flags (collected into arrays).

- [ ] **Step 1: Tests for argparse**

`src/retrofit/cli/argparse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseArgs } from './argparse.js';

describe('parseArgs', () => {
  it('handles a mix of bool, string, and repeatable flags', () => {
    const r = parseArgs(['--archetype', 'generic-ts', '--non-interactive', '--slot', 'workload=foo', '--slot=author=X'], {
      string: ['archetype'],
      boolean: ['non-interactive'],
      collect: ['slot'],
    });
    expect(r.archetype).toBe('generic-ts');
    expect(r['non-interactive']).toBe(true);
    expect(r.slot).toEqual(['workload=foo', 'author=X']);
  });

  it('returns positional args separately', () => {
    const r = parseArgs(['plan.json', '--branch', 'b'], {
      string: ['branch'],
      collect: [],
      boolean: [],
    });
    expect(r._).toEqual(['plan.json']);
    expect(r.branch).toBe('b');
  });

  it('throws on --foo with no value when foo is in `string`', () => {
    expect(() => parseArgs(['--archetype'], { string: ['archetype'], boolean: [], collect: [] })).toThrow(/missing value/);
  });

  it('passes through unknown long flags as boolean true (forward compat)', () => {
    const r = parseArgs(['--mystery'], { string: [], boolean: [], collect: [] });
    expect(r.mystery).toBe(true);
  });
});
```

- [ ] **Step 2: Implement argparse.ts**

`src/retrofit/cli/argparse.ts`:

```ts
export type ArgSpec = {
  string: string[];
  boolean: string[];
  collect: string[]; // repeatable: each occurrence pushed to an array
};

export type ParsedArgs = Record<string, unknown> & { _: string[] };

export function parseArgs(argv: string[], spec: ArgSpec): ParsedArgs {
  const out: ParsedArgs = { _: [] };
  const stringSet = new Set(spec.string);
  const boolSet = new Set(spec.boolean);
  const collectSet = new Set(spec.collect);

  let i = 0;
  while (i < argv.length) {
    const tok = argv[i]!;
    if (tok.startsWith('--')) {
      const eqIdx = tok.indexOf('=');
      const name = eqIdx >= 0 ? tok.slice(2, eqIdx) : tok.slice(2);
      const inlineValue = eqIdx >= 0 ? tok.slice(eqIdx + 1) : undefined;
      if (collectSet.has(name)) {
        const v = inlineValue ?? argv[++i];
        if (v === undefined) throw new Error(`--${name}: missing value`);
        const arr = (out[name] as string[]) ?? [];
        arr.push(v);
        out[name] = arr;
      } else if (stringSet.has(name)) {
        const v = inlineValue ?? argv[++i];
        if (v === undefined) throw new Error(`--${name}: missing value`);
        out[name] = v;
      } else if (boolSet.has(name)) {
        out[name] = inlineValue !== 'false';
      } else {
        // unknown flag — boolean true by default
        out[name] = inlineValue ?? true;
      }
    } else {
      out._.push(tok);
    }
    i++;
  }
  return out;
}
```

- [ ] **Step 3: Run argparse tests**

```bash
pnpm test:unit -- argparse.test
```
Expected: PASS — 4/4.

- [ ] **Step 4: Tests for prompt.ts**

`src/retrofit/cli/prompt.test.ts`:

```ts
import { Readable, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { makePromptCallback } from './prompt.js';

describe('makePromptCallback', () => {
  it('returns the line typed by the user (without trailing newline)', async () => {
    const input = Readable.from(['foo\n']);
    const output = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const prompt = makePromptCallback(input, output);
    const v = await prompt('workload');
    expect(v).toBe('foo');
    prompt.close();
  });

  it('asks once per call and returns sequential lines', async () => {
    const input = Readable.from(['first\nsecond\n']);
    const output = new Writable({ write(_chunk, _enc, cb) { cb(); } });
    const prompt = makePromptCallback(input, output);
    expect(await prompt('a')).toBe('first');
    expect(await prompt('b')).toBe('second');
    prompt.close();
  });
});
```

- [ ] **Step 5: Implement prompt.ts**

`src/retrofit/cli/prompt.ts`:

```ts
import { createInterface, Interface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { SlotKey } from '../resolvers/slots.js';

export type PromptCallback = ((key: SlotKey) => Promise<string>) & { close: () => void };

export function makePromptCallback(input: Readable = process.stdin, output: Writable = process.stdout): PromptCallback {
  const rl = createInterface({ input, output });
  const ask = async (key: SlotKey): Promise<string> => askLine(rl, `Slot value for ${key}: `);
  (ask as PromptCallback).close = () => rl.close();
  return ask as PromptCallback;
}

export type ConfirmPluginsCallback = ((proposed: string[]) => Promise<string[]>) & { close: () => void };

export function makeConfirmPluginsCallback(
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): ConfirmPluginsCallback {
  const rl = createInterface({ input, output });
  const confirm = async (proposed: string[]): Promise<string[]> => {
    if (proposed.length > 0) {
      output.write(`Proposed plugins:\n  ${proposed.join('\n  ')}\nEnable these? [Y/n]: `);
      const yn = (await askLine(rl, '')).trim().toLowerCase();
      if (yn === 'n' || yn === 'no') return [];
    } else {
      output.write('No plugins detected. ');
    }
    output.write('Add another? Empty to finish. (e.g., banana-claude@banana-claude-marketplace)\n');
    const additions: string[] = [];
    while (true) {
      const line = (await askLine(rl, '> ')).trim();
      if (!line) break;
      additions.push(line);
    }
    return [...proposed, ...additions];
  };
  (confirm as ConfirmPluginsCallback).close = () => rl.close();
  return confirm as ConfirmPluginsCallback;
}

function askLine(rl: Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, (answer) => resolve(answer)));
}
```

- [ ] **Step 6: Run, verify, commit**

```bash
pnpm test:unit -- "cli/prompt"
pnpm test:unit -- argparse.test
pnpm typecheck
git add src/retrofit/cli/argparse.ts src/retrofit/cli/argparse.test.ts src/retrofit/cli/prompt.ts src/retrofit/cli/prompt.test.ts
git commit -m "feat(retrofit): cli argparse + readline-based prompt callbacks"
```

---

## Task 2: cli/diagnose-cmd.ts (skeleton — argparse → diagnose() → write JSON)

**Files:**
- Create: `src/retrofit/cli/diagnose-cmd.ts`
- Create: `src/retrofit/cli/diagnose-cmd.test.ts`

The summary printer lands in Task 4. This task wires argparse + diagnose engine + file write.

- [ ] **Step 1: Implement diagnose-cmd.ts**

`src/retrofit/cli/diagnose-cmd.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import type { Plan } from '../types/index.js';
import { diagnose } from '../plan-builder/diagnose.js';
import type { SlotKey } from '../resolvers/slots.js';
import { parseArgs } from './argparse.js';
import { makeConfirmPluginsCallback, makePromptCallback } from './prompt.js';
import { formatDiagnoseSummary } from './format-diagnose-summary.js';

const DEFAULT_OUT = '.janus-retrofit.json';
const __dirname = dirname(fileURLToPath(import.meta.url));
const JANUS_ROOT = resolve(__dirname, '..', '..', '..'); // dist/retrofit/cli/ → janus root

export async function runDiagnose(argv: string[]): Promise<number> {
  if (process.platform === 'win32') {
    console.error('janus retrofit is not supported on Windows in v0.1.');
    return 1;
  }
  let args;
  try {
    args = parseArgs(argv, {
      string: ['archetype', 'out'],
      boolean: ['non-interactive', 'help'],
      collect: ['slot', 'plugin', 'no-plugin'],
    });
  } catch (e) {
    console.error(`janus diagnose: ${(e as Error).message}`);
    return 1;
  }
  if (args.help) {
    printDiagnoseHelp();
    return 0;
  }
  const archetype = (args.archetype as string | undefined) ?? '';
  if (!archetype) {
    console.error('janus diagnose: --archetype is required');
    printDiagnoseHelp();
    return 1;
  }
  const cliSlots: Partial<Record<SlotKey, string>> = {};
  for (const entry of (args.slot as string[] | undefined) ?? []) {
    const eq = entry.indexOf('=');
    if (eq < 0) {
      console.error(`janus diagnose: --slot expects key=value, got: ${entry}`);
      return 1;
    }
    cliSlots[entry.slice(0, eq) as SlotKey] = entry.slice(eq + 1);
  }
  const cliPluginAdd = (args.plugin as string[] | undefined) ?? [];
  const cliPluginRemove = (args['no-plugin'] as string[] | undefined) ?? [];
  const nonInteractive = Boolean(args['non-interactive']);
  const outPath = (args.out as string | undefined) ?? DEFAULT_OUT;

  const prompt = nonInteractive ? undefined : makePromptCallback();
  const confirmPlugins = nonInteractive ? undefined : makeConfirmPluginsCallback();

  let plan: Plan;
  try {
    plan = await diagnose({
      repoRoot: process.cwd(),
      archetype,
      janusRoot: JANUS_ROOT,
      cliSlots,
      cliPluginAdd,
      cliPluginRemove,
      nonInteractive,
      ...(prompt ? { prompt } : {}),
      ...(confirmPlugins ? { confirmPlugins } : {}),
    });
  } catch (e) {
    console.error(`janus diagnose: ${(e as Error).message}`);
    return 1;
  } finally {
    prompt?.close();
    confirmPlugins?.close();
  }

  writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(formatDiagnoseSummary(plan, outPath));
  return 0;
}

function printDiagnoseHelp(): void {
  console.log(`Usage: janus diagnose --archetype <name> [options]

Options:
  --archetype <name>            (required) one of: generic-ts, backend-functions,
                                backend-container-app, frontend-vite-react,
                                mcp-server, monorepo-root
  --out <path>                  default: ${DEFAULT_OUT}
  --slot key=value              repeatable; e.g. --slot workload=foo
  --plugin name@source          repeatable; force-enable a plugin
  --no-plugin name              repeatable; suppress an auto-detected plugin
  --non-interactive             fail if any required slot/plugin needs a prompt
  --help                        show this message
`);
}
```

- [ ] **Step 2: Run typecheck (test for diagnose-cmd lands in Task 4)**

```bash
pnpm typecheck
```

Note: typecheck will fail until Task 4 lands `formatDiagnoseSummary`. Add a temporary placeholder or land Task 3 then Task 4 first. Recommended: implement Task 4 BEFORE committing Task 2.

- [ ] **Step 3: Defer commit until Task 4 lands the formatter.**

---

## Task 3: cli/format-diagnose-summary.ts

**Files:**
- Create: `src/retrofit/cli/format-diagnose-summary.ts`
- Create: `src/retrofit/cli/format-diagnose-summary.test.ts`

Per spec §11 stdout block.

- [ ] **Step 1: Write the failing test**

`src/retrofit/cli/format-diagnose-summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Plan } from '../types/index.js';
import { formatDiagnoseSummary } from './format-diagnose-summary.js';

const plan: Plan = {
  schema_version: '1',
  meta: { janus_version: '0.1.0', generated_at: '2026-05-05T00:00:00Z' },
  payload: {
    repo_root: '/x',
    archetype: 'backend-functions',
    target_branch: 'janus/retrofit',
    slots: {
      workload: 'foo',
      description: 'd',
      archetype: 'backend-functions',
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
    },
    plugins: ['frontend-design@claude-plugins-official'],
    prior_marker: null,
    warnings: [
      { code: 'MODULE_TYPE_CHANGE', message: 'pkg type cjs → module', evidence: ['package.json:type'] },
    ],
    steps: [
      { id: 'displace-eslint', category: 'displace-tools', title: '', commit_message: 'chore: e', preconditions: [], operations: [{ op: 'delete_file', path: '.eslintrc.json' }], commit_paths: ['.eslintrc.json'] },
      { id: 'install-deps', category: 'install-deps', title: '', commit_message: 'chore: i', preconditions: [], operations: [{ op: 'shell', command: 'pnpm install', commit_paths: ['pnpm-lock.yaml'] }], commit_paths: ['pnpm-lock.yaml'] },
    ],
  },
};

describe('formatDiagnoseSummary', () => {
  it('mentions archetype, step count, slot summary, plugins, warnings', () => {
    const out = formatDiagnoseSummary(plan, '/tmp/x.json');
    expect(out).toContain('janus diagnose v0.1.0 — backend-functions');
    expect(out).toContain('Plan: 2 steps');
    expect(out).toContain('workload=foo');
    expect(out).toContain('frontend-design');
    expect(out).toContain('MODULE_TYPE_CHANGE');
    expect(out).toContain('Plan written to /tmp/x.json');
  });
});
```

- [ ] **Step 2: Implement format-diagnose-summary.ts**

`src/retrofit/cli/format-diagnose-summary.ts`:

```ts
import type { Plan } from '../types/index.js';

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
  lines.push(`Plugins: ${payload.plugins.length === 0 ? '(none)' : payload.plugins.map((p) => p.split('@')[0]).join(', ')}`);
  lines.push('');

  if (payload.warnings.length > 0) {
    lines.push(`Warnings: ${payload.warnings.length}`);
    for (const w of payload.warnings) {
      const ev = w.evidence.length > 0 ? ` (${w.evidence[0]})` : '';
      lines.push(`  - ${w.code}: ${w.message}${ev}`);
    }
    lines.push('');
  }
  lines.push(`Plan written to ${outPath}`);
  lines.push('Next: review the plan, then run `janus retrofit --plan ' + outPath + '`');
  return lines.join('\n');
}
```

- [ ] **Step 3: Run, verify, commit Tasks 2+3 together**

```bash
pnpm test:unit -- format-diagnose-summary.test
pnpm typecheck
git add src/retrofit/cli/diagnose-cmd.ts src/retrofit/cli/format-diagnose-summary.ts src/retrofit/cli/format-diagnose-summary.test.ts
git commit -m "feat(retrofit): cli/diagnose-cmd.ts + diagnose stdout summary formatter"
```

---

## Task 4: cli/format-retrofit-summary.ts

**Files:**
- Create: `src/retrofit/cli/format-retrofit-summary.ts`
- Create: `src/retrofit/cli/format-retrofit-summary.test.ts`

Per §9: "Retrofit complete on branch X (N commits, M warnings)" + push hint.

- [ ] **Step 1: Tests**

`src/retrofit/cli/format-retrofit-summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RunReport } from '../executor/run-report.js';
import { formatRetrofitSummary } from './format-retrofit-summary.js';

const sample: RunReport = {
  branch: 'janus/retrofit',
  total_steps: 5,
  committed: [
    { id: 'displace-eslint', sha: 'a' },
    { id: 'apply-shared-overlay/.github', sha: 'b' },
  ],
  skipped: [],
  empty: [],
  warnings_count: 2,
  last_good_sha: 'b',
};

describe('formatRetrofitSummary', () => {
  it('reports commit count, warnings, branch, and push hint', () => {
    const out = formatRetrofitSummary(sample);
    expect(out).toContain('Retrofit complete on branch janus/retrofit');
    expect(out).toContain('2 commits');
    expect(out).toContain('2 warnings');
    expect(out).toContain('git push -u origin janus/retrofit');
    expect(out).toContain('gh pr create --base staging');
  });

  it('singularizes 1 commit', () => {
    const r: RunReport = { ...sample, committed: sample.committed.slice(0, 1) };
    expect(formatRetrofitSummary(r)).toContain('1 commit,');
  });
});
```

- [ ] **Step 2: Implement format-retrofit-summary.ts**

`src/retrofit/cli/format-retrofit-summary.ts`:

```ts
import type { RunReport } from '../executor/run-report.js';

export function formatRetrofitSummary(report: RunReport): string {
  const n = report.committed.length;
  const w = report.warnings_count;
  const lines: string[] = [];
  lines.push(`✓ Retrofit complete on branch ${report.branch} (${n} commit${n === 1 ? '' : 's'}, ${w} warning${w === 1 ? '' : 's'})`);
  if (report.skipped.length > 0) {
    lines.push(`Skipped: ${report.skipped.map((s) => s.id).join(', ')}`);
  }
  if (report.empty.length > 0) {
    lines.push(`Empty (no diff): ${report.empty.map((s) => s.id).join(', ')}`);
  }
  lines.push('');
  lines.push('Next steps:');
  lines.push(`  git push -u origin ${report.branch}`);
  lines.push('  gh pr create --base staging   # janus convention: feature PRs target staging, not main');
  return lines.join('\n');
}
```

- [ ] **Step 3: Run, verify, commit**

```bash
pnpm test:unit -- format-retrofit-summary.test
pnpm typecheck
git add src/retrofit/cli/format-retrofit-summary.ts src/retrofit/cli/format-retrofit-summary.test.ts
git commit -m "feat(retrofit): retrofit stdout summary formatter"
```

---

## Task 5: cli/retrofit-cmd.ts

**Files:**
- Create: `src/retrofit/cli/retrofit-cmd.ts`

Argparse → load + validate plan → execute() → print summary. Handles `--branch` + auto-suggest soft-fail.

- [ ] **Step 1: Implement retrofit-cmd.ts**

`src/retrofit/cli/retrofit-cmd.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execute } from '../executor/index.js';
import { JanusError } from '../executor/errors.js';
import { suggestAvailableBranch } from '../executor/git.js';
import { validatePlan } from '../schema/validate.js';
import { parseArgs } from './argparse.js';
import { formatRetrofitSummary } from './format-retrofit-summary.js';

export async function runRetrofit(argv: string[]): Promise<number> {
  if (process.platform === 'win32') {
    console.error('janus retrofit is not supported on Windows in v0.1.');
    return 1;
  }
  let args;
  try {
    args = parseArgs(argv, {
      string: ['plan', 'branch'],
      boolean: ['help', 'dry-run', 'no-remote-check'],
      collect: [],
    });
  } catch (e) {
    console.error(`janus retrofit: ${(e as Error).message}`);
    return 1;
  }
  if (args.help) {
    printRetrofitHelp();
    return 0;
  }
  const planPath = (args.plan as string | undefined) ?? '';
  if (!planPath) {
    console.error('janus retrofit: --plan is required');
    printRetrofitHelp();
    return 1;
  }
  if (!existsSync(planPath)) {
    console.error(`janus retrofit: plan file not found: ${planPath}`);
    return 1;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(planPath, 'utf8'));
  } catch (e) {
    console.error(`janus retrofit: plan is not valid JSON: ${(e as Error).message}`);
    return 1;
  }
  const validation = validatePlan(parsed);
  if (!validation.ok) {
    console.error(`janus retrofit: plan failed schema validation:\n  ${validation.errors.join('\n  ')}`);
    return 1;
  }
  const plan = validation.value;
  const repoRoot = process.cwd();
  const noRemoteCheck = Boolean(args['no-remote-check']);
  const dryRun = Boolean(args['dry-run']);

  // Branch handling: if user supplied --branch, use it. Else use plan's default and rely on
  // pre-flight #14 to detect collisions; on TARGET_BRANCH_EXISTS, suggest the next free name.
  const branchOverride = args.branch as string | undefined;

  try {
    const report = await execute(plan, repoRoot, {
      planPath: resolve(planPath),
      ...(branchOverride ? { branch: branchOverride } : {}),
      noRemoteCheck,
      dryRun,
    });
    if (dryRun) {
      console.log(`✓ Dry run passed. ${plan.payload.steps.length} steps would run on branch ${report.branch}.`);
      return 0;
    }
    console.log(formatRetrofitSummary(report));
    return 0;
  } catch (e) {
    if (e instanceof JanusError && e.code === 'TARGET_BRANCH_EXISTS' && !branchOverride) {
      // Auto-suggest a free branch (soft-fail per §11).
      try {
        const suggestion = suggestAvailableBranch(repoRoot, plan.payload.target_branch, noRemoteCheck);
        console.error(
          `janus retrofit: target branch ${plan.payload.target_branch} exists; re-run with --branch ${suggestion}`,
        );
      } catch {
        console.error(`janus retrofit: target branch ${plan.payload.target_branch} exists and no free name in -2..-99`);
      }
      return 1;
    }
    if (e instanceof JanusError) {
      console.error(`janus retrofit: ${e.code}: ${e.message}`);
      if (e.remediation) console.error(`  → ${e.remediation}`);
      return 1;
    }
    console.error(`janus retrofit: internal error: ${(e as Error).message}`);
    return 3;
  }
}

function printRetrofitHelp(): void {
  console.log(`Usage: janus retrofit --plan <path> [options]

Options:
  --plan <path>                 (required) plan JSON written by \`janus diagnose\`
  --branch <name>               override target branch (default from plan)
  --dry-run                     run pre-flight + print step summary; no mutations
  --no-remote-check             skip \`git ls-remote\` for branch existence (offline)
  --help                        show this message
`);
}
```

- [ ] **Step 2: Run typecheck + commit (no unit test — exercised by Task 9 end-to-end)**

```bash
pnpm typecheck
git add src/retrofit/cli/retrofit-cmd.ts
git commit -m "feat(retrofit): cli/retrofit-cmd.ts — argparse + execute + summary + branch auto-suggest"
```

---

## Task 6: cli/unrecognized-tools.ts (read allowlist from docs)

**Files:**
- Create: `src/retrofit/cli/unrecognized-tools.ts`
- Create: `src/retrofit/cli/unrecognized-tools.test.ts`
- Modify: `docs/conventions/dependencies.md` — add the section.
- Modify: `src/retrofit/analyzer/index.ts` — replace hardcoded allowlist set with the loader.

Per spec §5, the allowlist lives at `docs/conventions/dependencies.md` under `## Unrecognized tools (retrofit warning allowlist)`. Reading docs at runtime keeps the allowlist editable as a one-PR docs change.

- [ ] **Step 1: Add the docs section**

Append to `docs/conventions/dependencies.md` (create file if absent):

```markdown
## Unrecognized tools (retrofit warning allowlist)

This list controls which package.json devDependencies surface a `UNKNOWN_TOOL`
warning during `janus diagnose`. Adding a tool here is a one-PR change; janus
v0.1 does not migrate any of these.

- lint-staged
- rome
- dprint
- standard
- xo
- changeset
- @changesets/cli
- turbo
- nx
- parcel
- rollup
- esbuild
- tsup
```

- [ ] **Step 2: Tests**

`src/retrofit/cli/unrecognized-tools.test.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadUnrecognizedToolsAllowlist } from './unrecognized-tools.js';

describe('loadUnrecognizedToolsAllowlist', () => {
  it('parses bullet list under the labeled heading', () => {
    const dir = mkdtempSync(join(tmpdir(), 'allow-'));
    const path = join(dir, 'dependencies.md');
    writeFileSync(
      path,
      `# Some heading

## Unrecognized tools (retrofit warning allowlist)

These tools warn but don't block.

- lint-staged
- turbo

## Next section

- not-included
`,
    );
    expect(loadUnrecognizedToolsAllowlist(path)).toEqual(['lint-staged', 'turbo']);
  });

  it('returns an empty list when section absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'allow-'));
    const path = join(dir, 'dependencies.md');
    writeFileSync(path, '# nothing here');
    expect(loadUnrecognizedToolsAllowlist(path)).toEqual([]);
  });

  it('returns an empty list when file missing', () => {
    expect(loadUnrecognizedToolsAllowlist('/tmp/definitely-not-here.md')).toEqual([]);
  });
});
```

- [ ] **Step 3: Implement unrecognized-tools.ts**

`src/retrofit/cli/unrecognized-tools.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';

const HEADING = '## Unrecognized tools (retrofit warning allowlist)';

export function loadUnrecognizedToolsAllowlist(path: string): string[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === HEADING);
  if (startIdx < 0) return [];
  const out: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^##\s/.test(l)) break; // next heading
    const m = l.match(/^- (.+)$/);
    if (m) out.push(m[1]!.trim());
  }
  return out;
}
```

- [ ] **Step 4: Wire it into analyzer/index.ts**

Replace the hardcoded `UNRECOGNIZED_TOOLS_ALLOWLIST` constant in `src/retrofit/analyzer/index.ts` with a function that takes the allowlist as a parameter. Update `analyze()` to accept an optional `allowlist?: string[]` parameter (defaulting to a small built-in fallback set so unit tests still work without docs paths). The CLI passes the loaded list:

In `src/retrofit/analyzer/index.ts`, change:

```ts
export function analyze(repoRoot: string, allowlist?: string[]): Omit<RepoSnapshot, 'baseline_files'> {
  // ... existing body ...
  const unrecognized_tools = detectUnrecognizedTools(pmResult.package_json, allowlist ?? FALLBACK_ALLOWLIST);
  // ...
}

const FALLBACK_ALLOWLIST = ['lint-staged']; // minimal — real list comes from docs at CLI time
```

And in `src/retrofit/plan-builder/diagnose.ts`, accept and pass `unrecognizedToolsAllowlist?: string[]` through to `analyze()`.

In `src/retrofit/cli/diagnose-cmd.ts`, before calling `diagnose()`:

```ts
import { loadUnrecognizedToolsAllowlist } from './unrecognized-tools.js';
// ...
const allowlist = loadUnrecognizedToolsAllowlist(join(JANUS_ROOT, 'docs/conventions/dependencies.md'));
plan = await diagnose({
  // ... existing fields ...
  unrecognizedToolsAllowlist: allowlist,
});
```

- [ ] **Step 5: Run, verify, commit**

```bash
pnpm test:unit -- unrecognized-tools.test
pnpm typecheck
git add src/retrofit/cli/unrecognized-tools.ts src/retrofit/cli/unrecognized-tools.test.ts src/retrofit/analyzer/index.ts src/retrofit/plan-builder/diagnose.ts src/retrofit/cli/diagnose-cmd.ts docs/conventions/dependencies.md
git commit -m "feat(retrofit): unrecognized-tools allowlist read from docs/conventions/dependencies.md"
```

---

## Task 7: bin/janus.js — register diagnose + retrofit subcommands

**Files:**
- Modify: `bin/janus.js`

bin/janus.js currently dispatches to bash. The new subcommands instead `import()` compiled JS from `dist/retrofit/cli/`. Keep the dispatch pattern minimal so existing `bootstrap`/`scaffold`/`check` are unaffected.

- [ ] **Step 1: Add the JS handlers + COMMANDS entries**

Edit `bin/janus.js`:

After the `COMMANDS` object, add:

```js
const TS_COMMANDS = {
  diagnose: {
    module: join(JANUS_ROOT, 'dist/retrofit/cli/diagnose-cmd.js'),
    exportName: 'runDiagnose',
    summary: 'Analyze the current repo and write a retrofit plan to .janus-retrofit.json',
  },
  retrofit: {
    module: join(JANUS_ROOT, 'dist/retrofit/cli/retrofit-cmd.js'),
    exportName: 'runRetrofit',
    summary: 'Apply a retrofit plan, landing changes as commits on a feature branch',
  },
};
```

In `printHelp()`, add a loop for `TS_COMMANDS` after the existing one:

```js
for (const [name, { summary }] of Object.entries(TS_COMMANDS)) {
  console.log(`  ${name.padEnd(10)} ${summary}`);
}
```

In the dispatch, after the existing `if/else if` chain, add:

```js
} else if (TS_COMMANDS[cmd]) {
  await runTsCommand(TS_COMMANDS[cmd], args);
}
```

(Wrap top-level into `await` by changing the script tail to an async IIFE if needed:)

```js
async function main() {
  // ... existing dispatch logic ...
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Add the `runTsCommand` helper:

```js
async function runTsCommand({ module, exportName }, scriptArgs) {
  if (!existsSync(module)) {
    console.error(`janus: subcommand requires \`pnpm build\` first; missing ${module}`);
    process.exit(1);
  }
  const mod = await import(module);
  const fn = mod[exportName];
  if (typeof fn !== 'function') {
    console.error(`janus: ${module} did not export ${exportName}`);
    process.exit(1);
  }
  const code = await fn(scriptArgs);
  process.exit(code ?? 0);
}
```

- [ ] **Step 2: Manual smoke test**

```bash
pnpm build
node bin/janus.js diagnose --help
# should print the diagnose help text and exit 0

node bin/janus.js retrofit --help
# should print the retrofit help text and exit 0

node bin/janus.js help
# should now list 5 commands: bootstrap, scaffold, check, diagnose, retrofit (+ update alias)
```

- [ ] **Step 3: Commit**

```bash
git add bin/janus.js
git commit -m "feat(retrofit): bin/janus.js — register diagnose + retrofit subcommands"
```

---

## Task 8: End-to-end CLI smoke test

**Files:**
- Create: `tests/integration/cli-end-to-end.test.ts`

Spawns `node bin/janus.js diagnose ...` then `node bin/janus.js retrofit ...` against a materialized fixture. Verifies the round trip: command exits 0, plan JSON written, retrofit branch created with commits.

- [ ] **Step 1: Test**

`tests/integration/cli-end-to-end.test.ts`:

```ts
import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../helpers/fixture-repo.js';

const JANUS_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BIN = join(JANUS_ROOT, 'bin/janus.js');

describe('CLI end-to-end (greenfield + generic-ts)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('runs diagnose then retrofit and produces a janus/retrofit branch with commits', () => {
    // Build first — bin/janus.js dispatches to dist/retrofit/cli/.
    execSync('pnpm build', { cwd: JANUS_ROOT, stdio: 'pipe' });

    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test/foo.git', { cwd: fx.dir, stdio: 'pipe' });

    // diagnose
    execFileSync('node', [BIN, 'diagnose',
      '--archetype', 'generic-ts',
      '--non-interactive',
      '--slot', 'author=Test',
      '--slot', 'author_email=t@e.com',
      '--slot', 'description=hello',
    ], { cwd: fx.dir, stdio: 'pipe' });
    expect(existsSync(join(fx.dir, '.janus-retrofit.json'))).toBe(true);

    // retrofit
    execFileSync('node', [BIN, 'retrofit',
      '--plan', '.janus-retrofit.json',
      '--no-remote-check',
    ], { cwd: fx.dir, stdio: 'pipe' });

    // Branch exists with commits
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: fx.dir }).toString().trim();
    expect(branch).toBe('janus/retrofit');
    const log = execSync('git log --oneline', { cwd: fx.dir }).toString();
    expect(log.split('\n').filter(Boolean).length).toBeGreaterThan(2);
    expect(existsSync(join(fx.dir, '.janus.json'))).toBe(true);
    expect(existsSync(join(fx.dir, 'biome.jsonc'))).toBe(true);
  }, 120_000);
});
```

- [ ] **Step 2: Run, verify**

```bash
pnpm test:unit -- cli-end-to-end.test
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/cli-end-to-end.test.ts
git commit -m "test(retrofit): CLI end-to-end smoke test (diagnose → retrofit on greenfield)"
```

---

## Task 9: README + CHANGELOG entry

**Files:**
- Modify: `README.md` — short usage section pointing at `npx @pantheon-tech/janus diagnose`/`retrofit`.
- Create or modify: `CHANGELOG.md` — add `## Unreleased` entry summarizing the retrofit feature.

- [ ] **Step 1: Add usage to README.md**

Append a new section near the existing scaffold/bootstrap usage (read README.md first to find the right place):

```markdown
### Retrofit an existing repo

```bash
# 1. Generate a plan
npx @pantheon-tech/janus diagnose --archetype generic-ts

# 2. Review .janus-retrofit.json (and the warnings in the summary above)

# 3. Apply the plan as a series of commits on a feature branch
npx @pantheon-tech/janus retrofit --plan .janus-retrofit.json

# 4. Push and PR
git push -u origin janus/retrofit
gh pr create --base staging
```
```

- [ ] **Step 2: CHANGELOG entry**

`CHANGELOG.md` — append (or create with) `## Unreleased`:

```markdown
## Unreleased

### Added
- `janus diagnose` subcommand: analyzes an existing repo and writes a retrofit plan
  to `.janus-retrofit.json`. Supports `--archetype`, `--slot`, `--plugin`, `--no-plugin`,
  `--non-interactive`, `--out`.
- `janus retrofit` subcommand: applies a generated plan as a series of commits on
  `janus/retrofit` (or `--branch <name>`). Supports `--dry-run`, `--no-remote-check`.
- Schema validators (`validatePlan`, `validateMarker`) shipped in `dist/retrofit/`.
- 12+ fixture repos under `tests/fixtures/repos/` exercising every analyzer concern.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: usage + changelog entry for janus diagnose/retrofit"
```

---

## Task 10: Final sanity — Plan 5 close-out

- [ ] **Step 1: Full suite**

```bash
pnpm test
```
Expected: PASS — all Plan 1-5 tests + bash smoke + new CLI end-to-end test.

- [ ] **Step 2: Clean build + typecheck + pack**

```bash
rm -rf dist .tsbuildinfo
pnpm build && pnpm typecheck
pnpm pack --dry-run
```
Expected: tarball includes `dist/retrofit/cli/` modules.

- [ ] **Step 3: Biome fixups**

```bash
pnpm check
git status
git add -A && git commit -m "chore(retrofit): biome formatting fixups for Plan 5"   # if diff
```

- [ ] **Step 4: Manual dogfood (out of test scope; track follow-ups as issues)**

Run `npx @pantheon-tech/janus diagnose --archetype <a>` against at least two real pre-janus repos. Capture any `UNKNOWN_TOOL` warnings; consider adding to `docs/conventions/dependencies.md`. File one GH issue per surprising warning.

Plan 5 complete. End state:
- `npx @pantheon-tech/janus diagnose --archetype <a>` produces a valid `.janus-retrofit.json`.
- `npx @pantheon-tech/janus retrofit --plan .janus-retrofit.json` lands the changes on `janus/retrofit`.
- Both commands accept the full §11 flag set including `--non-interactive`, `--dry-run`, `--branch`, `--no-remote-check`.
- Interactive prompts wired (slot resolution + plugin confirmation) via `node:readline`.
- Unrecognized-tools allowlist sourced from `docs/conventions/dependencies.md`.
- README + CHANGELOG document the feature.

---

## Self-review checklist

1. **Spec coverage:**
   - §11 CLI surface (both subcommands, all flags, default `--out`, exit codes) → Tasks 2, 5
   - §11 diagnose stdout summary → Task 3
   - §9 retrofit stdout summary → Task 4
   - §5a interactive slot prompt + non-interactive failure surfacing → Task 1 + Task 2
   - §5b plugin confirmation prompt → Task 1
   - §5 unrecognized_tools allowlist source → Task 6
   - §13 Windows out-of-scope → first-line check in Tasks 2, 5
2. **Backward compatibility:** existing `bootstrap`/`scaffold`/`check` subcommands untouched. No bash scripts modified by Plan 5.
3. **Build dependency:** `bin/janus.js` now requires `dist/` to exist for diagnose/retrofit. Print a clear error if absent (Task 7 step 1). `pnpm install` does NOT auto-build; package consumers get `dist/` from the npm tarball (which Plan 1 wired into `files[]`).
4. **TODO follow-ups (not blocking v0.1):**
   - `WARN_OVERWRITE_USER_KIT` warnings for skills/hooks overlay are still surfaced only in the run report, not in the diagnose summary. Future enrichment could compute and display them at diagnose time.
   - Resolved-slot prompt re-prompt loop on validation failure: currently 3 attempts then throw (Plan 2 Task 12). Plan 5's prompt callback respects this. UX consideration: print the validation reason between prompts. Filed as enhancement.
   - Manual dogfood findings (Task 10 step 4) drive the v0.2 backlog.

---

## Series complete

Plan 5 is the final plan in the janus retrofit series. After execution:
- `npx @pantheon-tech/janus diagnose` and `npx @pantheon-tech/janus retrofit` are user-facing.
- `validatePlan` / `validateMarker` are public API.
- `dist/` ships everything; consumers don't need a TypeScript toolchain.
- The full v0.1 surface as specified in `docs/superpowers/specs/2026-05-04-janus-retrofit-design.md` is implemented and tested.

Next steps after the entire 5-plan series ships:
1. Cut a release (`pnpm publish`).
2. Dogfood across at least two real pre-janus repos.
3. Open issues per surprising warning or rough edge.
4. Plan v0.2 based on dogfood findings (likely candidates per the spec's risks: drift detection, partial monorepo retrofit, agents/commands overlay support).
