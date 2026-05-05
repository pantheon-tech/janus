# janus retrofit — Plan 1 of 5: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a TypeScript build + test pipeline inside janus, then ship the on-disk JSON schemas (`plan.schema.json`, `marker.schema.json`) plus the TypeScript types and an Ajv-backed validator. End-state: `pnpm build`, `pnpm typecheck`, and `pnpm test` all pass; schema validators reject malformed plans and accept good ones.

**Architecture:** Janus today is plain JS + bash with no TypeScript or test framework. Plan 1 adds a self-contained TypeScript build (`src/retrofit/` → `dist/retrofit/`) wired into npm scripts, vitest for unit tests, Ajv for runtime JSON-schema validation, and the foundational schemas + types that every later plan (analyzer, plan-builder, executor) will import. No user-facing CLI behavior is added in this plan; `bin/janus.js` is untouched. Outcome is invisible to end users but unblocks all subsequent plans.

**Tech Stack:** TypeScript 5.x, vitest 3.x, ajv 8.x, @types/node 24.x. Existing tooling (biome, lefthook, commitlint, pnpm) is reused. Schemas authored as hand-written JSON Schema draft 2020-12; types hand-written to match (drift caught by validator tests).

**Spec reference:** `docs/superpowers/specs/2026-05-04-janus-retrofit-design.md` §7 (plan schema), §10 (marker schema), §15 (implementation sketch).

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `tsconfig.json` | Project tsconfig, extends `tsconfig.base.json`, narrows `rootDir`/`outDir` to `src/`/`dist/` |
| `vitest.config.ts` | Vitest config — node env, glob `src/**/*.test.ts` and `tests/**/*.test.ts` |
| `src/retrofit/schema/plan.schema.json` | JSON Schema 2020-12 for the on-disk Plan format |
| `src/retrofit/schema/marker.schema.json` | JSON Schema 2020-12 for the on-disk `.janus.json` marker format |
| `src/retrofit/schema/validate.ts` | Ajv wrapper exporting `validatePlan(input)`, `validateMarker(input)` with typed return discriminated unions |
| `src/retrofit/schema/validate.test.ts` | Vitest tests covering valid + every documented invalid case |
| `src/retrofit/types/index.ts` | TypeScript types matching the schemas: `Plan`, `JanusMarker`, every `Operation` variant, `Warning`, `Step`, etc. Also owns the `SHELL_WHITELIST` const + derived `ShellCommand` type. |
| `src/retrofit/errors.ts` | Central `JanusError` class, `ERROR_CODES` const, and `MID_EXECUTION_CODES` set used by Plans 2-5 |
| `src/retrofit/errors.test.ts` | Vitest tests for the JanusError module |
| `tests/fixtures/plans/minimal-valid.json` | Smallest possible valid plan |
| `tests/fixtures/plans/invalid-missing-schema-version.json` | Negative fixture — missing required field |
| `tests/fixtures/plans/invalid-bad-op.json` | Negative fixture — unknown op in `operations[]` |
| `tests/fixtures/markers/minimal-valid.json` | Smallest possible valid marker |

**Modify:**

| Path | Change |
|---|---|
| `package.json` | Add devDeps (typescript, vitest, ajv, @types/node); add scripts (build, typecheck, test:unit); update test script to chain bash + vitest; add `dist` to `files[]` |
| `biome.jsonc` | Add `!tests/fixtures/**` to `files.includes` so deliberately-malformed negative fixtures don't fail biome |
| `.gitignore` | Add `dist/`, `coverage/`, `*.tsbuildinfo` |

**Out of scope for Plan 1:** `bin/janus.js` (untouched until Plan 5 wires up the CLI subcommands), `RepoSnapshot`/`SlotMap`/`PluginSet` types (defined when their owning module lands in Plans 2/3).

---

## Task 1: Add TypeScript + vitest + Ajv devDeps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package.json**

Replace the `devDependencies` block and the `scripts` block.

```json
{
  "scripts": {
    "lint": "biome check biome.jsonc package.json scripts bin src",
    "format": "biome format --write biome.jsonc package.json scripts bin src",
    "check": "biome check --write biome.jsonc package.json scripts bin src",
    "typecheck": "tsc --noEmit",
    "build": "tsc && cp -r src/retrofit/schema dist/retrofit/",
    "test:unit": "vitest run",
    "test": "bash tests/scaffold-smoke-test.sh && bash tests/bootstrap-smoke-test.sh && pnpm test:unit",
    "prepare": "lefthook install || true"
  },
  "devDependencies": {
    "@biomejs/biome": "~2.4.13",
    "@commitlint/cli": "~20.5.2",
    "@commitlint/config-conventional": "~20.5.0",
    "@types/node": "~24.0.0",
    "ajv": "~8.17.1",
    "ajv-formats": "~3.0.1",
    "lefthook": "~2.1.6",
    "typescript": "~5.7.0",
    "vitest": "~3.0.0"
  }
}
```

Note on the `build` script: `tsc` does NOT copy `.json` files into `dist/`. The `cp -r src/retrofit/schema dist/retrofit/` step is required so that downstream consumers can `import('./dist/retrofit/schema/plan.schema.json', { with: { type: 'json' } })` and so the vendored Ajv loader can resolve the schema file at runtime.

Also add `"dist"` to the `files[]` array (preserve existing entries):

```json
"files": [
  "bin",
  "dist",
  "scripts",
  "templates",
  "user-scope",
  "docs/conventions",
  "README.md",
  "LICENSE"
]
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: lockfile updates, `node_modules/typescript`, `node_modules/vitest`, `node_modules/ajv` present.

- [ ] **Step 3: Verify typecheck fails (expected — no tsconfig yet)**

Run: `pnpm typecheck`
Expected: FAIL with `error TS5057: Cannot find a tsconfig.json file at the specified directory: '.'` or similar — confirms the script is wired but config is missing.

- [ ] **Step 4: Update `biome.jsonc` to cover the new tree**

The "Files modified" table above lists `biome.jsonc`; this step makes the actual edit. Two changes are needed in `biome.jsonc`'s `files.includes` array:

1. The existing `**` glob already pulls in `src/retrofit/**` (no change required for the positive include — the lint scripts in this `package.json` also pass `src` explicitly).
2. Add an exclude for `tests/fixtures/**` so the deliberately-malformed negative fixtures (`invalid-bad-op.json`, `invalid-missing-schema-version.json`) do not fail biome lint or formatting.

Patch `biome.jsonc` `files.includes` to:

```jsonc
"includes": [
  "**",
  "!**/node_modules",
  "!**/dist",
  "!**/build",
  "!**/out",
  "!**/coverage",
  "!**/.next",
  "!**/.astro",
  "!**/.claude",
  "!**/*.min.js",
  "!**/pnpm-lock.yaml",
  "!templates",
  "!tests/fixtures/**"
]
```

Run: `pnpm check`
Expected: PASS — biome ignores `tests/fixtures/**` and accepts everything else.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml biome.jsonc
git commit -m "chore(retrofit): add typescript, vitest, ajv devDeps for retrofit foundation"
```

---

## Task 2: Add tsconfig.json

**Files:**
- Create: `tsconfig.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create tsconfig.json**

`tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "./.tsbuildinfo",
    "incremental": true,
    "composite": false,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "src/**/*.json"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

Note: `*.test.ts` excluded so `tsc --build` doesn't emit test files into `dist/`. Vitest typechecks them at test time.

- [ ] **Step 2: Update .gitignore**

Append to `.gitignore` (read first to avoid duplicating existing patterns):

```
dist/
coverage/
.tsbuildinfo
```

- [ ] **Step 3: Verify typecheck passes (empty input)**

Run: `pnpm typecheck`
Expected: PASS silently (no `.ts` files exist yet, nothing to check).

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json .gitignore
git commit -m "chore(retrofit): add project tsconfig and ignore dist/coverage"
```

---

## Task 3: Add vitest.config.ts

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/retrofit/**/*.ts'],
      exclude: ['src/retrofit/**/*.test.ts', 'src/retrofit/**/types/**'],
    },
  },
});
```

- [ ] **Step 2: Verify vitest runs (no tests yet)**

Run: `pnpm test:unit`
Expected: PASS with `No test files found, exiting with code 0` or similar (vitest 3 prints `No tests found` and exits 0 when zero tests match).

If vitest exits non-zero on zero tests, add `passWithNoTests: true` to the `test` block in `vitest.config.ts`.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "chore(retrofit): add vitest config for src and tests glob"
```

---

## Task 4: Add plan.schema.json

**Files:**
- Create: `src/retrofit/schema/plan.schema.json`

- [ ] **Step 1: Create the schema directory and file**

`src/retrofit/schema/plan.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://janus.pantheon.tech/schemas/plan.schema.json",
  "title": "JanusRetrofitPlan",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "meta", "payload"],
  "properties": {
    "schema_version": { "const": "1" },
    "meta": {
      "type": "object",
      "additionalProperties": false,
      "required": ["janus_version", "generated_at"],
      "properties": {
        "janus_version": { "type": "string" },
        "generated_at": { "type": "string", "format": "date-time" }
      }
    },
    "payload": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "repo_root",
        "archetype",
        "target_branch",
        "slots",
        "plugins",
        "prior_marker",
        "warnings",
        "steps"
      ],
      "properties": {
        "repo_root": { "type": "string" },
        "archetype": {
          "enum": [
            "generic-ts",
            "backend-functions",
            "backend-container-app",
            "frontend-vite-react",
            "mcp-server",
            "monorepo-root"
          ]
        },
        "target_branch": { "type": "string", "minLength": 1 },
        "slots": {
          "type": "object",
          "additionalProperties": { "type": "string" },
          "required": [
            "workload",
            "description",
            "archetype",
            "github_org",
            "author",
            "author_email",
            "node_version",
            "license",
            "region",
            "template_version",
            "year",
            "date",
            "base_branch"
          ]
        },
        "plugins": { "type": "array", "items": { "type": "string" } },
        "prior_marker": {
          "oneOf": [{ "type": "null" }, { "$ref": "marker.schema.json" }]
        },
        "warnings": {
          "type": "array",
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["code", "message", "evidence"],
            "properties": {
              "code": { "type": "string" },
              "message": { "type": "string" },
              "evidence": { "type": "array", "items": { "type": "string" } }
            }
          }
        },
        "steps": {
          "type": "array",
          "items": { "$ref": "#/$defs/Step" }
        }
      }
    }
  },
  "$defs": {
    "Step": {
      "type": "object",
      "additionalProperties": false,
      "required": ["id", "category", "title", "commit_message", "preconditions", "operations", "commit_paths"],
      "properties": {
        "id": { "type": "string", "minLength": 1 },
        "category": {
          "enum": [
            "displace-tools",
            "set-package-manager",
            "apply-shared-overlay",
            "apply-archetype-overlay",
            "merge-claude-kit",
            "install-deps",
            "write-marker"
          ]
        },
        "title": { "type": "string", "minLength": 1 },
        "commit_message": { "type": "string", "pattern": "^chore: " },
        "preconditions": {
          "type": "array",
          "items": { "$ref": "#/$defs/Precondition" }
        },
        "operations": {
          "type": "array",
          "items": { "$ref": "#/$defs/Operation" }
        },
        "commit_paths": { "type": "array", "items": { "type": "string" } }
      }
    },
    "Precondition": {
      "type": "object",
      "additionalProperties": false,
      "required": ["type"],
      "properties": {
        "type": { "enum": ["file_exists", "file_absent", "json_pointer_equals"] },
        "path": { "type": "string" },
        "pointer": { "type": "string" },
        "value": {}
      }
    },
    "Operation": {
      "oneOf": [
        { "$ref": "#/$defs/OpWriteFile" },
        { "$ref": "#/$defs/OpDeleteFile" },
        { "$ref": "#/$defs/OpDeleteDirectory" },
        { "$ref": "#/$defs/OpRenameFile" },
        { "$ref": "#/$defs/OpChmod" },
        { "$ref": "#/$defs/OpJsonSet" },
        { "$ref": "#/$defs/OpJsonRemove" },
        { "$ref": "#/$defs/OpJsonRemoveMatching" },
        { "$ref": "#/$defs/OpJsonMerge" },
        { "$ref": "#/$defs/OpClaudeSettingsMerge" },
        { "$ref": "#/$defs/OpGitignoreMerge" },
        { "$ref": "#/$defs/OpShell" }
      ]
    },
    "OpWriteFile": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "path", "content"],
      "properties": {
        "op": { "const": "write_file" },
        "path": { "type": "string" },
        "content": { "type": "string" },
        "mode": { "type": "integer" },
        "pre_state_hash": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
        "overwrite": { "type": "boolean" }
      }
    },
    "OpDeleteFile": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "path"],
      "properties": {
        "op": { "const": "delete_file" },
        "path": { "type": "string" },
        "pre_state_hash": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" }
      }
    },
    "OpDeleteDirectory": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "path"],
      "properties": {
        "op": { "const": "delete_directory" },
        "path": { "type": "string" }
      }
    },
    "OpRenameFile": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "from", "to"],
      "properties": {
        "op": { "const": "rename_file" },
        "from": { "type": "string" },
        "to": { "type": "string" },
        "pre_state_hash": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" }
      }
    },
    "OpChmod": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "path", "mode"],
      "properties": {
        "op": { "const": "chmod" },
        "path": { "type": "string" },
        "mode": { "type": "integer" }
      }
    },
    "OpJsonSet": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "path", "pointer", "value"],
      "properties": {
        "op": { "const": "json_set" },
        "path": { "type": "string" },
        "pointer": { "type": "string", "pattern": "^/" },
        "value": {}
      }
    },
    "OpJsonRemove": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "path", "pointer"],
      "properties": {
        "op": { "const": "json_remove" },
        "path": { "type": "string" },
        "pointer": { "type": "string", "pattern": "^/" }
      }
    },
    "OpJsonRemoveMatching": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "path", "pointer"],
      "properties": {
        "op": { "const": "json_remove_matching" },
        "path": { "type": "string" },
        "pointer": { "type": "string", "pattern": "^/" },
        "value_regex": { "type": "string" },
        "key_regex": { "type": "string" }
      },
      "oneOf": [
        { "required": ["value_regex"], "not": { "required": ["key_regex"] } },
        { "required": ["key_regex"], "not": { "required": ["value_regex"] } }
      ]
    },
    "OpJsonMerge": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "path", "pointer", "value"],
      "properties": {
        "op": { "const": "json_merge" },
        "path": { "type": "string" },
        "pointer": { "type": "string", "pattern": "^/" },
        "value": { "type": "object" }
      }
    },
    "OpClaudeSettingsMerge": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "additions"],
      "properties": {
        "op": { "const": "claude_settings_merge" },
        "additions": { "type": "object" },
        "pre_state_hash": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" }
      }
    },
    "OpGitignoreMerge": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "lines"],
      "properties": {
        "op": { "const": "gitignore_merge" },
        "lines": { "type": "array", "items": { "type": "string" } },
        "pre_state_hash": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" }
      }
    },
    "OpShell": {
      "type": "object",
      "additionalProperties": false,
      "required": ["op", "command"],
      "properties": {
        "op": { "const": "shell" },
        "command": {
          "enum": [
            "pnpm install",
            "pnpm dedupe",
            "git config --unset core.hooksPath",
            "find .git/hooks -type f -not -name \"*.sample\" -delete"
          ]
        }
      }
    }
  }
}
```

- [ ] **Step 2: Verify build still passes**

The Task-1 `build` script already includes `cp -r src/retrofit/schema dist/retrofit/`, so the JSON files appear in `dist/` after `tsc` runs.

Run: `pnpm build`
Expected: PASS. Then assert `dist/retrofit/schema/plan.schema.json` exists (e.g. `ls dist/retrofit/schema/plan.schema.json`).

- [ ] **Step 3: Commit**

```bash
git add src/retrofit/schema/plan.schema.json
git commit -m "chore(retrofit): add plan.schema.json (Plan format spec §7)"
```

---

## Task 5: Add marker.schema.json

**Files:**
- Create: `src/retrofit/schema/marker.schema.json`

- [ ] **Step 1: Create the file**

`src/retrofit/schema/marker.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://janus.pantheon.tech/schemas/marker.schema.json",
  "title": "JanusMarker",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "janus_version",
    "archetype",
    "applied_at",
    "applied_steps",
    "skipped_steps",
    "slots",
    "plugins",
    "shared_overlay_version",
    "archetype_overlay_version"
  ],
  "properties": {
    "schema_version": { "const": "1" },
    "janus_version": { "type": "string" },
    "archetype": {
      "enum": [
        "generic-ts",
        "backend-functions",
        "backend-container-app",
        "frontend-vite-react",
        "mcp-server",
        "monorepo-root"
      ]
    },
    "applied_at": { "type": "string", "format": "date-time" },
    "applied_steps": { "type": "array", "items": { "type": "string" } },
    "skipped_steps": { "type": "array", "items": { "type": "string" } },
    "slots": {
      "type": "object",
      "additionalProperties": { "type": "string" },
      "required": [
        "workload",
        "description",
        "archetype",
        "github_org",
        "author",
        "author_email",
        "node_version",
        "license",
        "region",
        "template_version",
        "year",
        "date",
        "base_branch"
      ]
    },
    "plugins": { "type": "array", "items": { "type": "string" } },
    "shared_overlay_version": { "type": "string" },
    "archetype_overlay_version": { "type": "string" }
  }
}
```

- [ ] **Step 2: Verify build copies the file**

Run: `pnpm build && ls dist/retrofit/schema/`
Expected: both `plan.schema.json` and `marker.schema.json` listed.

- [ ] **Step 3: Commit**

```bash
git add src/retrofit/schema/marker.schema.json
git commit -m "chore(retrofit): add marker.schema.json (.janus.json spec §10)"
```

---

## Task 6: Add TypeScript types matching schemas

**Files:**
- Create: `src/retrofit/types/index.ts`

- [ ] **Step 1: Create the types file**

`src/retrofit/types/index.ts`:

```ts
/**
 * Types matching the on-disk Plan and Marker JSON schemas.
 * Hand-written to mirror src/retrofit/schema/*.schema.json.
 * Drift between schema and type is caught at runtime by the validator
 * tests in src/retrofit/schema/validate.test.ts.
 */

export type Archetype =
  | 'generic-ts'
  | 'backend-functions'
  | 'backend-container-app'
  | 'frontend-vite-react'
  | 'mcp-server'
  | 'monorepo-root';

export type SlotMap = {
  workload: string;
  description: string;
  archetype: string;
  github_org: string;
  author: string;
  author_email: string;
  node_version: string;
  license: string;
  region: string;
  template_version: string;
  year: string;
  date: string;
  base_branch: string;
} & Record<string, string>;

export type PluginSet = string[];

export type Warning = {
  code: string;
  message: string;
  evidence: string[];
};

export type Precondition =
  | { type: 'file_exists'; path: string }
  | { type: 'file_absent'; path: string }
  | { type: 'json_pointer_equals'; path: string; pointer: string; value: unknown };

export type StepCategory =
  | 'displace-tools'
  | 'set-package-manager'
  | 'apply-shared-overlay'
  | 'apply-archetype-overlay'
  | 'merge-claude-kit'
  | 'install-deps'
  | 'write-marker';

export type Sha256 = `sha256:${string}`;

export const SHELL_WHITELIST = [
  'pnpm install',
  'pnpm dedupe',
  'git config --unset core.hooksPath',
  'find .git/hooks -type f -not -name "*.sample" -delete',
] as const;
export type ShellCommand = (typeof SHELL_WHITELIST)[number];

export type Operation =
  | { op: 'write_file'; path: string; content: string; mode?: number; pre_state_hash?: Sha256; overwrite?: boolean }
  | { op: 'delete_file'; path: string; pre_state_hash?: Sha256 }
  | { op: 'delete_directory'; path: string }
  | { op: 'rename_file'; from: string; to: string; pre_state_hash?: Sha256 }
  | { op: 'chmod'; path: string; mode: number }
  | { op: 'json_set'; path: string; pointer: string; value: unknown }
  | { op: 'json_remove'; path: string; pointer: string }
  | { op: 'json_remove_matching'; path: string; pointer: string; value_regex: string }
  | { op: 'json_remove_matching'; path: string; pointer: string; key_regex: string }
  | { op: 'json_merge'; path: string; pointer: string; value: Record<string, unknown> }
  | { op: 'claude_settings_merge'; additions: Record<string, unknown>; pre_state_hash?: Sha256 }
  | { op: 'gitignore_merge'; lines: string[]; pre_state_hash?: Sha256 }
  | { op: 'shell'; command: ShellCommand };

export type Step = {
  id: string;
  category: StepCategory;
  title: string;
  commit_message: string;
  preconditions: Precondition[];
  operations: Operation[];
  commit_paths: string[];
};

export type JanusMarker = {
  schema_version: '1';
  janus_version: string;
  archetype: Archetype;
  applied_at: string;
  applied_steps: string[];
  skipped_steps: string[];
  slots: SlotMap;
  plugins: PluginSet;
  shared_overlay_version: string;
  archetype_overlay_version: string;
};

export type Plan = {
  schema_version: '1';
  meta: {
    janus_version: string;
    generated_at: string;
  };
  payload: {
    repo_root: string;
    archetype: Archetype;
    target_branch: string;
    slots: SlotMap;
    plugins: PluginSet;
    prior_marker: JanusMarker | null;
    warnings: Warning[];
    steps: Step[];
  };
};
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/retrofit/types/index.ts
git commit -m "chore(retrofit): add Plan and JanusMarker types matching schemas"
```

---

## Task 7: Add central JanusError module

**Files:**
- Create: `src/retrofit/errors.test.ts`
- Create: `src/retrofit/errors.ts`

- [ ] **Step 1: Write the failing test**

`src/retrofit/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { JanusError, MID_EXECUTION_CODES } from './errors.js';

describe('JanusError', () => {
  it('exposes the code passed to the constructor', () => {
    const err = new JanusError('NOT_IN_GIT_REPO', 'msg');
    expect(err.code).toBe('NOT_IN_GIT_REPO');
  });

  it('exposes the optional remediation string', () => {
    const err = new JanusError('NOT_IN_GIT_REPO', 'msg', 'fix it');
    expect(err.remediation).toBe('fix it');
  });
});

describe('MID_EXECUTION_CODES', () => {
  it('contains mid-execution-only codes', () => {
    expect(MID_EXECUTION_CODES.has('PRE_STATE_HASH_MISMATCH')).toBe(true);
  });

  it('does not contain pre-flight codes', () => {
    expect(MID_EXECUTION_CODES.has('NOT_IN_GIT_REPO')).toBe(false);
  });
});
```

- [ ] **Step 2: Run vitest, expect FAIL**

Run: `pnpm test:unit`
Expected: FAIL with `Failed to resolve import "./errors.js"` — module does not exist yet.

- [ ] **Step 3: Create `src/retrofit/errors.ts`**

`src/retrofit/errors.ts`:

```ts
export const ERROR_CODES = [
  // diagnose pre-flight (#1-#8)
  'NOT_IN_GIT_REPO', 'INVALID_ARCHETYPE', 'MARKER_INVALID', 'TOOL_MISSING',
  'HAS_SUBMODULES', 'TARGET_PATH_SYMLINK', 'CASE_COLLISION',
  'INVOKED_FROM_WORKSPACE_MEMBER',
  // retrofit pre-flight (#9-#16)
  'PLAN_FILE_INVALID', 'PLAN_SCHEMA_INVALID', 'SCHEMA_VERSION_MISMATCH',
  'REPO_ROOT_MISMATCH', 'TREE_DIRTY', 'HEAD_DETACHED',
  'TARGET_BRANCH_EXISTS', 'BRANCH_SUGGESTION_EXHAUSTED', 'REMOTE_UNREACHABLE',
  'INVOKED_FROM_WORKTREE',
  // execution
  'PRE_STATE_HASH_MISMATCH', 'PRE_STATE_HASH_MISSING_FILE',
  'EXTRANEOUS_FILE_MODIFICATIONS', 'GITIGNORE_BLOCK_MALFORMED',
  'CLAUDE_PRE_JANUS_EXISTS', 'CLAUDE_TEMPLATE_UNEXPECTED_HEAD',
  'SHELL_NOT_WHITELISTED', 'COMMIT_HOOK_FAILED',
  // resolvers (Plan 2 throws these)
  'SLOT_VALIDATION_FAILED', 'SLOT_UNRESOLVED_NON_INTERACTIVE',
  // generic
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
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
// Plan 5's retrofit-cmd uses this to map to exit code 2.
export const MID_EXECUTION_CODES: ReadonlySet<ErrorCode> = new Set([
  'PRE_STATE_HASH_MISMATCH', 'PRE_STATE_HASH_MISSING_FILE',
  'EXTRANEOUS_FILE_MODIFICATIONS', 'GITIGNORE_BLOCK_MALFORMED',
  'CLAUDE_PRE_JANUS_EXISTS', 'CLAUDE_TEMPLATE_UNEXPECTED_HEAD',
  'SHELL_NOT_WHITELISTED', 'COMMIT_HOOK_FAILED',
]);
```

- [ ] **Step 4: Run vitest, expect PASS**

Run: `pnpm test:unit`
Expected: PASS — all four assertions in `errors.test.ts` green.

- [ ] **Step 5: Commit**

```bash
git add src/retrofit/errors.ts src/retrofit/errors.test.ts
git commit -m "feat: central JanusError + ERROR_CODES + MID_EXECUTION_CODES"
```

---

## Task 8: Write the failing validator test (TDD red)

**Files:**
- Create: `tests/fixtures/plans/minimal-valid.json`
- Create: `tests/fixtures/plans/invalid-missing-schema-version.json`
- Create: `tests/fixtures/plans/invalid-bad-op.json`
- Create: `tests/fixtures/markers/minimal-valid.json`
- Create: `src/retrofit/schema/validate.test.ts`

- [ ] **Step 1: Create the valid plan fixture**

`tests/fixtures/plans/minimal-valid.json`:

```json
{
  "schema_version": "1",
  "meta": {
    "janus_version": "0.1.0",
    "generated_at": "2026-05-05T00:00:00.000Z"
  },
  "payload": {
    "repo_root": "/tmp/example",
    "archetype": "generic-ts",
    "target_branch": "janus/retrofit",
    "slots": {
      "workload": "example",
      "description": "Example workload",
      "archetype": "generic-ts",
      "github_org": "pantheon-tech",
      "author": "Daniel Skipper",
      "author_email": "daniel@skipper.kiwi",
      "node_version": "24",
      "license": "MIT",
      "region": "australiaeast",
      "template_version": "v0.1.0",
      "year": "2026",
      "date": "2026-05-05",
      "base_branch": "staging"
    },
    "plugins": [],
    "prior_marker": null,
    "warnings": [],
    "steps": []
  }
}
```

- [ ] **Step 2: Create the invalid-missing-schema-version fixture**

`tests/fixtures/plans/invalid-missing-schema-version.json`:

Same as the valid fixture but with the `schema_version` field deleted. The test asserts the validator rejects with an error mentioning `schema_version`.

```json
{
  "meta": {
    "janus_version": "0.1.0",
    "generated_at": "2026-05-05T00:00:00.000Z"
  },
  "payload": {
    "repo_root": "/tmp/example",
    "archetype": "generic-ts",
    "target_branch": "janus/retrofit",
    "slots": {
      "workload": "example",
      "description": "Example workload",
      "archetype": "generic-ts",
      "github_org": "pantheon-tech",
      "author": "Daniel Skipper",
      "author_email": "daniel@skipper.kiwi",
      "node_version": "24",
      "license": "MIT",
      "region": "australiaeast",
      "template_version": "v0.1.0",
      "year": "2026",
      "date": "2026-05-05",
      "base_branch": "staging"
    },
    "plugins": [],
    "prior_marker": null,
    "warnings": [],
    "steps": []
  }
}
```

- [ ] **Step 3: Create the invalid-bad-op fixture**

`tests/fixtures/plans/invalid-bad-op.json`:

Same as the valid fixture but with one step containing an unknown op (`"op": "rm_rf_root"`). The test asserts the validator rejects.

```json
{
  "schema_version": "1",
  "meta": {
    "janus_version": "0.1.0",
    "generated_at": "2026-05-05T00:00:00.000Z"
  },
  "payload": {
    "repo_root": "/tmp/example",
    "archetype": "generic-ts",
    "target_branch": "janus/retrofit",
    "slots": {
      "workload": "example",
      "description": "Example workload",
      "archetype": "generic-ts",
      "github_org": "pantheon-tech",
      "author": "Daniel Skipper",
      "author_email": "daniel@skipper.kiwi",
      "node_version": "24",
      "license": "MIT",
      "region": "australiaeast",
      "template_version": "v0.1.0",
      "year": "2026",
      "date": "2026-05-05",
      "base_branch": "staging"
    },
    "plugins": [],
    "prior_marker": null,
    "warnings": [],
    "steps": [
      {
        "id": "evil",
        "category": "displace-tools",
        "title": "Evil step",
        "commit_message": "chore: evil",
        "preconditions": [],
        "operations": [{ "op": "rm_rf_root", "path": "/" }],
        "commit_paths": []
      }
    ]
  }
}
```

- [ ] **Step 4: Create the valid marker fixture**

`tests/fixtures/markers/minimal-valid.json`:

```json
{
  "schema_version": "1",
  "janus_version": "0.1.0",
  "archetype": "generic-ts",
  "applied_at": "2026-05-05T00:00:00.000Z",
  "applied_steps": [],
  "skipped_steps": [],
  "slots": {
    "workload": "example",
    "description": "Example workload",
    "archetype": "generic-ts",
    "github_org": "pantheon-tech",
    "author": "Daniel Skipper",
    "author_email": "daniel@skipper.kiwi",
    "node_version": "24",
    "license": "MIT",
    "region": "australiaeast",
    "template_version": "v0.1.0",
    "year": "2026",
    "date": "2026-05-05",
    "base_branch": "staging"
  },
  "plugins": [],
  "shared_overlay_version": "0.1.0",
  "archetype_overlay_version": "0.1.0"
}
```

- [ ] **Step 5: Write the failing test**

`src/retrofit/schema/validate.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateMarker, validatePlan } from './validate.js';

const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'tests', 'fixtures');

function loadJson(relPath: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, relPath), 'utf8'));
}

describe('validatePlan', () => {
  it('accepts a minimal valid plan', () => {
    const result = validatePlan(loadJson('plans/minimal-valid.json'));
    expect(result.ok).toBe(true);
  });

  it('rejects a plan missing schema_version', () => {
    const result = validatePlan(loadJson('plans/invalid-missing-schema-version.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /schema_version/.test(e))).toBe(true);
    }
  });

  it('rejects a plan with an unknown op', () => {
    const result = validatePlan(loadJson('plans/invalid-bad-op.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects a non-object input', () => {
    const result = validatePlan('not a plan');
    expect(result.ok).toBe(false);
  });
});

describe('validateMarker', () => {
  it('accepts a minimal valid marker', () => {
    const result = validateMarker(loadJson('markers/minimal-valid.json'));
    expect(result.ok).toBe(true);
  });

  it('rejects a marker missing required fields', () => {
    const result = validateMarker({ schema_version: '1' });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test:unit`
Expected: FAIL with errors like `Failed to resolve import "./validate.js"` (because validate.ts doesn't exist yet) — that's the expected red.

- [ ] **Step 7: Commit (red state)**

```bash
git add tests/fixtures/plans tests/fixtures/markers src/retrofit/schema/validate.test.ts
git commit -m "test(retrofit): add validator fixtures and failing tests"
```

---

## Task 9: Implement validate.ts (TDD green)

**Files:**
- Create: `src/retrofit/schema/validate.ts`

- [ ] **Step 1: Implement the validator**

`src/retrofit/schema/validate.ts`:

```ts
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { JanusMarker, Plan } from '../types/index.js';
import markerSchema from './marker.schema.json' with { type: 'json' };
import planSchema from './plan.schema.json' with { type: 'json' };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

// Register marker schema by $id so plan schema's $ref can resolve it.
ajv.addSchema(markerSchema, 'marker.schema.json');

const compiledPlan: ValidateFunction = ajv.compile(planSchema);
const compiledMarker: ValidateFunction = ajv.compile(markerSchema);

function formatErrors(errors: ErrorObject[] | null | undefined): string[] {
  if (!errors) return ['unknown validation error'];
  return errors.map((e) => `${e.instancePath || '<root>'} ${e.message ?? ''} (${JSON.stringify(e.params)})`);
}

export function validatePlan(input: unknown): ValidationResult<Plan> {
  if (compiledPlan(input)) {
    return { ok: true, value: input as Plan };
  }
  return { ok: false, errors: formatErrors(compiledPlan.errors) };
}

export function validateMarker(input: unknown): ValidationResult<JanusMarker> {
  if (compiledMarker(input)) {
    return { ok: true, value: input as JanusMarker };
  }
  return { ok: false, errors: formatErrors(compiledMarker.errors) };
}
```

Notes for the implementer:

- `with { type: 'json' }` is the Node 20+ ESM JSON import attribute. Requires `--experimental-json-modules` on Node 20; native on 22+. If your Node is 20.x, the `tsconfig.base.json` `module: NodeNext` setting should handle it; if not, fall back to runtime `JSON.parse(readFileSync(...))`.
- `Ajv2020` is the draft 2020-12 dialect. Required because schemas use `$schema: https://json-schema.org/draft/2020-12/schema`.
- `strict: false` because the spec uses `additionalProperties: false` and `oneOf` patterns Ajv would otherwise warn about.

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm test:unit`
Expected: PASS — all 6 tests green.

If a test fails because Ajv can't find `marker.schema.json` referenced from `plan.schema.json`: confirm `addSchema` is called BEFORE `compile(planSchema)`. The order in the file above is correct.

If a test fails because of JSON import attribute syntax: switch to `import { readFileSync } from 'node:fs'; import { fileURLToPath } from 'node:url'; const planSchema = JSON.parse(readFileSync(new URL('./plan.schema.json', import.meta.url), 'utf8'));` — same effect, no attribute syntax.

- [ ] **Step 3: Run typecheck and biome**

Run: `pnpm typecheck && pnpm check`
Expected: both PASS.

- [ ] **Step 4: Commit (green state)**

```bash
git add src/retrofit/schema/validate.ts
git commit -m "feat(retrofit): add Ajv-backed schema validators for plan and marker"
```

---

## Task 10: Wire dist/ into npm package, verify end-to-end

**Files:**
- Modify: `package.json` (already updated in Task 1; verify `files[]` includes `dist`)
- Modify: `tests/fixtures/plans/.gitignore` (none — fixtures are checked in)
- Verify: `pnpm pack` produces a tarball containing `dist/retrofit/`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS — both bash smoke tests AND the new vitest suite green.

- [ ] **Step 2: Run a clean build + typecheck**

```bash
rm -rf dist .tsbuildinfo
pnpm build
pnpm typecheck
```

Expected: both PASS. `dist/retrofit/schema/{plan,marker}.schema.json` and `dist/retrofit/{schema,types}/*.js` should exist.

- [ ] **Step 3: Verify `pnpm pack` packages correctly**

Run: `pnpm pack --dry-run`
Expected output includes lines for `dist/retrofit/schema/plan.schema.json`, `dist/retrofit/schema/marker.schema.json`, `dist/retrofit/schema/validate.js`, `dist/retrofit/types/index.js`. If `dist` files are missing, re-check `files[]` in package.json from Task 1.

- [ ] **Step 4: Run lint + format check (biome scope now includes src/)**

Run: `pnpm check`
Expected: PASS — biome should accept the new TS/JSON files (defaults are lenient).

- [ ] **Step 5: Commit any formatting fixups biome made**

```bash
git status
# If anything changed:
git add -A && git commit -m "chore(retrofit): biome formatting fixups for src/"
# Otherwise skip.
```

- [ ] **Step 6: Final commit — close out Plan 1**

If no fixups in Step 5, this step is a no-op. Otherwise commit any remaining changes:

```bash
git status
# Should be clean.
```

Plan 1 is complete. End state:

- `pnpm build` produces `dist/retrofit/`.
- `pnpm typecheck` passes.
- `pnpm test` runs scaffold/bootstrap smoke tests AND vitest, all green.
- `validatePlan` and `validateMarker` are importable, typed, runtime-tested.
- `dist/` ships in the npm package (verified by `pnpm pack --dry-run`).

---

## Self-review checklist

After completing all tasks above, verify:

1. **Spec coverage:**
   - §7 (Plan format) → covered by `plan.schema.json` (Task 4) and `Plan` type (Task 6)
   - §10 (Marker format) → covered by `marker.schema.json` (Task 5) and `JanusMarker` type (Task 6)
   - Validator at retrofit pre-flight #9 → `validatePlan` exists (Task 9); the pre-flight call site is Plan 4's responsibility
   - Determinism contract on `payload` → schema validates structure; hashing of `payload` is Plan 3's responsibility (plan-builder)
   - Op vocabulary closed-set rule → schema's `Operation.oneOf` lists exactly the 12 ops; unknown ops rejected (Task 8's `invalid-bad-op.json` test proves it)

2. **No placeholders:** all step bodies contain runnable commands or full code blocks. No `TODO`, no "implement appropriately."

3. **Type/schema consistency:** TypeScript types in `src/retrofit/types/index.ts` mirror the JSON schemas. The validator's runtime check + the test fixtures catch divergence.

4. **Bite-sized tasks:** longest single step is the schema-file write (Task 4 Step 1). All others are <2 minutes of work.

---

## Plan 2 preview (do not execute as part of Plan 1)

Plan 2 will build on this foundation:

- `src/retrofit/analyzer/` — per-concern detectors producing a `RepoSnapshot`
- `src/retrofit/resolvers/` — slot + plugin resolution
- `src/retrofit/plan-builder/overlay-tree.ts` — the rendered overlay tree mirroring scaffold.sh
- `tests/fixtures/repos/` — ~12 fixture repos for analyzer + slot tests
- New types: `RepoSnapshot`, `BaselineFileStatus`, `ClaudeKitSnapshot`, etc.

What later plans (2-5) consume from Plan 1:

- `src/retrofit/types/index.ts` — `Plan`, `JanusMarker`, `Operation`, `Step`, `Warning`, `SlotMap`, `PluginSet`, `Archetype`, `Sha256`, plus the `SHELL_WHITELIST` const and derived `ShellCommand` type. The const is the single source of truth; every plan that builds or executes a `shell` op imports `SHELL_WHITELIST` from this module rather than redeclaring the literals.
- `src/retrofit/schema/validate.ts` — `validatePlan`, `validateMarker` for runtime checks (Plan 4's pre-flight #9, Plan 5's CLI loaders).
- `src/retrofit/errors.ts` — `JanusError` class, `ERROR_CODES` const, `ErrorCode` type, and the `MID_EXECUTION_CODES` set. Plans 2-5 throw `JanusError` with codes drawn from `ERROR_CODES`; Plan 5's `retrofit-cmd` uses `MID_EXECUTION_CODES` to map mid-execution failures to exit code 2.

End-state: `RepoSnapshot` for any of the fixture repos, slot resolution end-to-end against fixtures, overlay tree byte-equal to scaffold.sh's output for a known archetype. Still no user-facing CLI behavior.
