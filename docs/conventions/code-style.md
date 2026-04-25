---
title: Code Style
type: reference
last_reviewed: 2026-04-24
owners: [@skipnz]
---

# Code Style

Opinionated defaults. Enforced by Biome v2 (`biome.jsonc`) wherever mechanical.

## Formatting

| Rule | Value |
|---|---|
| Indent | 2 spaces |
| Line width | **100** |
| Quotes (TS/JS) | single |
| JSX quotes | single |
| Trailing commas | all |
| Semicolons | always |
| Arrow parens | always |
| Bracket spacing | yes (`{ a }` not `{a}`) |
| Bracket same line | no |
| Line endings | LF (`.gitattributes` enforces) |
| Final newline | required (`.editorconfig` enforces) |

## Naming

| Entity | Convention | Example |
|---|---|---|
| File | `kebab-case.ts` | `order-service.ts` |
| React component | `PascalCase.tsx` (matches component name) | `OrderTicket.tsx` |
| Class / Type / Interface | `PascalCase` (no `I` prefix for interfaces) | `OrderService`, `OrderInput` |
| Function / variable | `camelCase` | `createOrder`, `orderId` |
| Constant (module-level, truly constant) | `SCREAMING_SNAKE` | `MAX_RETRIES`, `DEFAULT_TIMEOUT_MS` |
| Enum value | `PascalCase` or `SCREAMING_SNAKE` (consistent within enum) | `OrderState.Working` |
| Test file | `<source>.test.ts` co-located | `order-service.test.ts` |
| Story file | `<component>.stories.tsx` | `OrderTicket.stories.tsx` |
| Bicep parameter | `camelCase` | `workloadName`, `environment` |

## Imports

**Order** (enforced by Biome's organizeImports):
1. Node built-ins with `node:` prefix
2. External packages
3. Internal alias (`@/...`)
4. Parent (`../`)
5. Sibling (`./`)
6. Style / asset imports

**Rules**:
- **No default exports** (except explicit library entry points like `src/index.ts`). Named exports enable rename-refactor across the codebase.
- **No barrel files** (`index.ts` that re-exports everything) inside packages. Exception: the single entry point of a published package.
- **Path aliases**: `@/*` → `src/*`. Use absolute (`@/services/...`) across layer boundaries; relative (`./...`) within the same directory.
- **Type imports**: `import type { X } from '...'`. Biome `useImportType` enforces.

```ts
// Good
import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { logger } from '@/lib/logger';
import { ordersRepo } from '@/repositories/orders.repo';

import type { Order } from './types';
import { buildQuery } from './helpers';

export async function createOrder(input: CreateOrderInput): Promise<Order> { /* ... */ }

// Bad
import * as fs from 'fs';             // ✗ missing node: prefix
import { helper } from '../../helpers'; // ✗ use @/... alias
export default function createOrder() { } // ✗ default export
```

### NodeNext extensions

`tsconfig.base.json` sets `module: NodeNext`. Under NodeNext (and `Node16`), import statements MUST include the file extension — and that extension is `.js`, even when the source file is `.ts`:

```ts
// Good
import { logger } from './logger.js';
import { ordersRepo } from '@/repositories/orders.repo.js';

// Bad — fails at runtime under NodeNext (ERR_MODULE_NOT_FOUND)
import { logger } from './logger';
```

This catches new contributors who expect bundler-style extensionless imports. Configure VS Code to add `.js` automatically:

```jsonc
// .vscode/settings.json
{
  "typescript.preferences.importModuleSpecifierEnding": "js"
}
```

Type-only imports follow the same rule: `import type { X } from './types.js'`.

## TypeScript strictness

`tsconfig.base.json` enforces:

- `strict: true`
- `noUncheckedIndexedAccess: true` — array/record access returns `T | undefined`
- `exactOptionalPropertyTypes: true` — `x?: T` means `T | absent`, not `T | undefined`
- `noImplicitOverride: true`
- `noFallthroughCasesInSwitch: true`
- `noImplicitReturns: true`
- `isolatedModules: true`

**Never use `any`.** Biome `noExplicitAny` is `error`. Prefer `unknown` + narrowing.

**Avoid `!` non-null assertion.** Biome warns. Use an explicit check or a helper like `assertDefined(x)`.

### Strict optional properties

`exactOptionalPropertyTypes` is enabled. `x?: T` means `x` may be **absent** OR have value `T` — explicitly assigning `undefined` is rejected:

```ts
type User = { name?: string };

const a: User = {};                  // ok — absent
const b: User = { name: 'Ada' };     // ok
const c: User = { name: undefined }; // ✗ TS error
```

Implications when consuming JSON or building patches:

- For deserialised JSON where a key may be missing OR present-with-`null`, model it as `name?: string | null` rather than `name?: string`.
- To "clear" an optional field, `delete obj.name` instead of `obj.name = undefined`.
- For partial-update DTOs accepting explicit nulls, prefer `name: string | null` (required key, value nullable) over `name?: string`.

## Hard-line rules

Hard-line rules:

- **500 lines per file max.** Manual review during PR — there is no automated enforcement (Biome has no `maxFileLines` rule as of v2.4; track upstream at <https://github.com/biomejs/biome/issues>). Reviewers reject files over 500 lines; if the work genuinely needs more, split the module before merge.
- **50 lines per function max** (exc. JSX render fns, type defs).
- **5 parameters per function max.** Use an options object for more.
- **Cyclomatic complexity ≤ 10** per function.

## Comments

- **Only WHY, never WHAT.** If removing the comment wouldn't confuse a future reader, delete it.
- **No `// TODO` without a linked issue.** `// TODO(#123): ...` is acceptable; orphan TODOs rot.
- **No `// added for issue #X`** or `// fix for PR #Y` — the commit has that context.
- **JSDoc on public package exports only.** Internal code relies on names + types.

## Async

- **`async`/`await` everywhere.** No `.then` chains in src.
- **`Promise.all` for independent parallel work.** Don't sequentially `await` independent calls.
- **`AbortSignal` propagated** through all I/O for cancellation.

## Dates, times, money

- **UTC internally, always.** Convert to local only at display layer.
- **`Temporal` API** (Node 22+) when available; `Date` otherwise. Never hand-compose date strings.
- **Money as fixed-point integers** (cents) or `decimal.js`. **Never float** for currency.
- **Durations as ISO 8601 strings** or structured objects. No "magic number means minutes".

## Null / undefined

- **`undefined`** for "not provided" (optional, missing).
- **`null`** for "explicitly absent / cleared".
- Pick one meaning per field; don't use both.
- `exactOptionalPropertyTypes` catches accidental `T | undefined` assignments to `T?`.

## Logging

- **No `console.log` in src.** Biome `noConsoleLog` is warn → will promote to error in future revision.
- Use the `logger` from `lib/logger.ts` (pino-based).
- Never log secrets — redact paths in pino config.

## Commit style

**Conventional Commits** enforced by commitlint.

```
<type>(<scope>): <short description>

<optional body>

<optional footer>
```

Types: `feat | fix | docs | chore | refactor | test | perf | ci | build | revert`.
Scope (optional): package / area (e.g. `feat(orders): ...`).

Breaking changes: `BREAKING CHANGE:` footer OR `!` after type: `feat!: remove deprecated API`.
