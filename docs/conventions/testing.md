---
title: Testing
type: reference
last_reviewed: 2026-04-24
owners: [@skipnz]
---

# Testing

## Pyramid

| Level | Scope | Tool | Volume |
|---|---|---|---|
| Unit | Pure logic, utilities | Vitest | High volume, fast enough to run on every save |
| Integration | Services + real dependencies | Vitest | Medium volume |
| Contract | Frontend ↔ backend wire types | Vitest | Low volume |
| E2E | Browser through real ingress | Playwright | Critical paths only |

## Unit tests

- **Pure logic in services, utilities, domain functions.**
- Mock **repositories** (the persistence boundary). Don't mock inside services.
- Co-located: `order-service.ts` + `order-service.test.ts`.

```ts
// order-service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createOrder } from './order-service';

describe('createOrder', () => {
  it('rejects negative quantity', async () => {
    const repo = { create: vi.fn() };
    const result = await createOrder(
      { quantity: -1, price: 100, entityId: 'e1' },
      { repo },
    );
    expect(result.ok).toBe(false);
    expect(result.ok || result.error.code).toBe('INVALID_QUANTITY');
    expect(repo.create).not.toHaveBeenCalled();
  });
});
```

## Integration tests

**Hit real dependencies where feasible.** Mocks are for external APIs only.

- **Cosmos**: run against the Cosmos emulator (local) or a dedicated test account (CI).
- **Postgres / SQL**: testcontainers-node spinning up a real Postgres.
- **Redis**: testcontainers-node.
- **Key Vault**: mock or use an actual staging vault scoped to CI SP.

Rationale: mocks lie. Real-dependency tests catch contract mismatches that mocked tests pass through.

```ts
// orders.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CosmosClient } from '@azure/cosmos';

describe('orders repo — integration', () => {
  let client: CosmosClient;
  beforeAll(() => {
    client = new CosmosClient({ endpoint: 'https://localhost:8081', key: '...' });
    // set up container
  });
  afterAll(async () => { /* teardown */ });

  it('creates and retrieves an order', async () => {
    const repo = makeOrdersRepo(client);
    const order = await repo.create({ /* ... */ });
    const found = await repo.get(order.id);
    expect(found).toEqual(order);
  });
});
```

**File suffix convention**: `*.integration.test.ts` vs `*.test.ts` so Vitest can filter:
```json
{
  "scripts": {
    "test": "vitest run src",
    "test:integration": "vitest run --testPathPattern='.integration.test.ts$'",
    "test:unit": "vitest run --testPathIgnorePatterns='.integration.test.ts$'"
  }
}
```

## Contract tests

- **Import shared `@scope/types` package** in both frontend and backend.
- Write tests that exercise the full request/response cycle using mocked server but real wire-types on both sides.
- Breaks compile if types drift — automatic enforcement without runtime test cost.

## E2E tests

- **Playwright** for browser tests.
- **One test per critical user journey**: login, happy-path order creation, critical admin action.
- **Not per feature, not per UI state.** If you'd re-do it manually when smoke-testing, it's E2E-worthy; otherwise unit.
- Run against **staging environment** nightly; against local dev on PR for smoke.

```ts
// e2e/place-order.spec.ts
import { test, expect } from '@playwright/test';

test('user can place an order', async ({ page }) => {
  await page.goto('/');
  await page.fill('[data-testid=email]', 'test@example.com');
  // ... MSAL login flow ...
  await page.click('[data-testid=new-order]');
  await page.fill('[data-testid=quantity]', '10');
  await page.click('[data-testid=submit]');
  await expect(page.locator('[data-testid=order-confirmed]')).toBeVisible();
});
```

## Test-driven loop

- **New feature**: write a failing test first (red), implement minimum to pass (green), refactor.
- **Bug fix**: write a test that reproduces the bug FIRST, verify it fails, fix code, verify it passes.
- **Regression**: if a bug slipped through, add a test for it in the same PR as the fix.

## Coverage

- **No hard threshold.** Don't chase coverage numbers; chase meaningful tests.
- **Services should be well-covered** (they contain the logic worth testing).
- **Routes need only happy-path + major error paths** (logic lives in services).
- **Configurations / types** don't need tests.

Emit coverage reports in CI but don't gate merge on them — let reviewers see trends.

## Snapshots

- **Snapshot tests only for stable, understandable output.** Not for dynamic content.
- **Inline snapshots** over external files when short; easier to review.
- **Update snapshots deliberately**, not by default on mismatch.

## Flaky tests

- **Quarantine immediately** (`.skip` with a TODO link).
- **Never land-and-rerun.** A flake that passes a retry is still broken.
- Track quarantine count as a quality metric.

## Fixtures

- **Colocated with tests** for single-test fixtures.
- **`tests/fixtures/`** for shared fixtures.
- **Real-world fixtures** where possible — capture actual API responses as JSON rather than hand-crafting. A fixture-replay helper that records once and replays in tests pays off quickly.
