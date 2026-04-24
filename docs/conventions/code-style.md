---
title: Code Style
type: reference
last_reviewed: 2026-04-24
authorising_adr: 0001
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

## Hard-line rules

From `oaf/RULES.md` style — codified here:

- **500 lines per file max.** Enforced via Biome `maxFileLines` when available; manual review otherwise.
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
