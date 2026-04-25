---
title: Frontend State Management
type: reference
last_reviewed: 2026-04-24
---

# State Management (Frontend)

## Library

**Zustand v5.** Minimal, composable, no boilerplate, ~1 KB gzipped. Avoid Redux (over-engineered for your scale), avoid Context-only for state that changes often (causes whole-tree re-renders).

## Store shapes

### Per-domain stores

One store per logical domain. Don't make a monolithic "AppStore".

```
src/stores/                       # GLOBAL (cross-feature)
├── connection.ts                 # WS connection, user identity, RBAC
├── theme.ts                      # theme preference
└── ui.ts                         # global UI flags

src/features/<feature>/store.ts   # FEATURE-LOCAL state
```

### Global vs feature-local

- **Global** — connection status, theme, user session, RBAC permissions, app-ready flag.
- **Feature-local** — lives in `features/<feature>/store.ts`. Order tickets, form state, feature toggles.

## Surgical selectors

**Always subscribe to individual fields.** Never consume the whole store.

```ts
// Good — re-renders only when `connected` changes
const connected = useConnectionStore((s) => s.connected);
const user = useConnectionStore((s) => s.user);

// Bad — re-renders on every store change (even unrelated fields)
const store = useConnectionStore();
const connected = store.connected;
```

For multiple fields together, use `shallow` or a selector that returns a typed tuple:

```ts
import { useShallow } from 'zustand/react/shallow';

const { connected, user } = useConnectionStore(
  useShallow((s) => ({ connected: s.connected, user: s.user })),
);
```

## Store anatomy

```ts
// stores/connection.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface ConnectionState {
  connected: boolean;
  user: User | null;
  permissions: string[];
  setConnected: (connected: boolean) => void;
  setUser: (user: User | null) => void;
  hasPermission: (p: string) => boolean;
}

export const useConnectionStore = create<ConnectionState>()(
  devtools(
    (set, get) => ({
      connected: false,
      user: null,
      permissions: [],
      setConnected: (connected) => set({ connected }),
      setUser: (user) => set({ user, permissions: user?.permissions ?? [] }),
      hasPermission: (p) => get().permissions.includes(p),
    }),
    { name: 'connection' },
  ),
);
```

Rules:

- **Store file = store** (no other logic in the file).
- **Actions are methods on the store**, not external functions that call `setState`.
- **Derived state via selectors**, never duplicated in state.
- **`devtools` wrapper** in dev mode (strip in prod via env check if bundle size matters).

## Action patterns

### Simple state update

```ts
setUser: (user) => set({ user }),
```

### Derived update (using current state)

```ts
incrementClickCount: () => set((state) => ({ clickCount: state.clickCount + 1 })),
```

### Async action (prefer outside the store, pass in the mutator)

```ts
// feature hook
export function useCreateOrder() {
  const addOrder = useOrdersStore((s) => s.addOrder);
  return async (input: CreateOrderInput) => {
    const order = await ordersApi.create(input);
    addOrder(order);
    return order;
  };
}
```

Async logic in hooks/services, not in the store. Keeps stores pure.

## Avoiding whole-store subscriptions

A common anti-pattern:

```ts
// ❌ Component re-renders whenever ANY order-store field changes
const { orders, workingOrders, filledOrders, cancelOrder } = useOrdersStore();

// ✓ Each field is a separate subscription
const workingOrders = useOrdersStore((s) => s.workingOrders);
const cancelOrder = useOrdersStore((s) => s.cancelOrder);
```

## Hot paths — named in AGENTS.md

High-frequency updates (ticks, streams) can kill perf if wired naively. Document hot paths in AGENTS.md Critical Context:

```
## Critical Context

- Pricing updates RAF-batched in useMarketStore — changes must preserve the batching pattern.
- Trade flash animations bypass React via classList manipulation on [data-flash] — don't convert to state.
```

## Persistence

- **`zustand/middleware/persist`** for user-preference state (theme, workspace layout).
- **Never persist secrets or tokens.** Those live in memory or `sessionStorage` (never `localStorage`).
- **Never persist ephemeral UI state** (modal open/closed, current form input).

## Testing stores

- Stores are trivially testable:

```ts
import { useOrdersStore } from './store';

beforeEach(() => {
  useOrdersStore.setState(useOrdersStore.getInitialState());  // reset
});

it('adds order', () => {
  useOrdersStore.getState().addOrder(sampleOrder);
  expect(useOrdersStore.getState().orders).toContain(sampleOrder);
});
```
