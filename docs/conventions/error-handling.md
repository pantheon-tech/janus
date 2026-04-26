---
title: Error Handling
type: reference
last_reviewed: 2026-04-24
owners: []  # add owners for this project
---

# Error Handling

## The split

- **Domain errors** (business rule violations): **return** via `Result<T, E>`.
- **Infrastructure errors** (DB down, network fail, bug): **throw**. Propagate to the outermost handler.

## Why

- Domain errors are expected outcomes — an order can fail credit check; that's a business signal, not a bug.
- Infrastructure errors are bugs or outages — a DB connection dropping is not a business outcome.

Mixing them (throwing `InsufficientCreditError`) means every service call needs a try/catch *just in case* the error is a domain signal. Returning domain errors keeps the call sites linear.

## Error class hierarchy

```ts
// lib/errors.ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 500,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class DomainError extends AppError {
  constructor(code: string, message: string, httpStatus = 400) {
    super(code, message, httpStatus);
  }
}

export class InfrastructureError extends AppError {
  constructor(code: string, message: string, cause?: unknown) {
    super(code, message, 500, cause);
  }
}

export class AuthError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 401);
  }
}

export class NotFoundError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 404);
  }
}
```

**Never extend `Error` directly.** Always extend `AppError` (or a subclass).

## Result type

```ts
// lib/result.ts
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
```

Or import a library (`neverthrow`) if you prefer a richer surface. Keep one choice per project.

## Service pattern

```ts
// services/orders.service.ts
export async function createOrder(
  input: CreateOrderInput,
): Promise<Result<Order, DomainError>> {
  if (input.quantity <= 0) {
    return err(new DomainError('INVALID_QUANTITY', 'Quantity must be positive'));
  }

  const creditOk = await creditService.check(input.entityId, input.notional);
  if (!creditOk) {
    return err(new DomainError('INSUFFICIENT_CREDIT', 'Credit limit exceeded', 409));
  }

  // ordersRepo.create throws on DB failure — infra error propagates
  const order = await ordersRepo.create(input);

  return ok(order);
}
```

## Route handler pattern

```ts
// functions/orders-create.ts (Azure Functions v4)
export async function createOrderHandler(req: HttpRequest): Promise<HttpResponseInit> {
  const parsed = CreateOrderSchema.safeParse(await req.json());
  if (!parsed.success) {
    return { status: 400, jsonBody: { error: 'INVALID_INPUT', details: parsed.error } };
  }

  const result = await ordersService.createOrder(parsed.data);
  if (!result.ok) {
    return {
      status: result.error.httpStatus,
      jsonBody: { error: result.error.code, message: result.error.message },
    };
  }

  return { status: 201, jsonBody: result.value };
}

// Infrastructure errors propagate up → global error handler → 500 + alert.
```

## Global error handler

```ts
// middleware/error-handler.ts (Express/Fastify/Container App) or lib/errors.ts handler (Functions)
export function handleError(err: unknown, req, res) {
  const correlationId = req.correlationId;
  
  if (err instanceof AppError) {
    req.log.warn({ err, correlationId }, 'Application error');
    return res.status(err.httpStatus).json({
      error: err.code,
      message: err.message,
      correlationId,
    });
  }

  // Unknown — genuine bug
  req.log.error({ err, correlationId }, 'Unhandled error');
  return res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    correlationId,
  });
}
```

**Never leak stack traces to clients.** Log them server-side, return `correlationId` so support can trace.

## HTTP status mapping

| Error class | Status | When |
|---|---|---|
| `DomainError` | 400 (default), 409, 422 | Business rule violation, conflict, unprocessable |
| `AuthError` | 401 | Missing/invalid auth |
| `NotFoundError` | 404 | Resource not found |
| `InfrastructureError` | 500 | DB, network, external API failure |
| anything else | 500 | Unexpected bug |

## Never do this

- **Swallow exceptions.** Every `catch` must re-throw, log-and-re-throw, or transform to a typed failure.
- **Return `null` for failures.** Callers lose type information about what went wrong.
- **Mix throw and return for the same function.** Pick one.
- **`try/catch` "just in case"** around internal calls that can't throw.
- **Catch → `console.error` → continue.** Silent failures are worse than loud ones.

## Frontend error handling

- **`lib/api/client.ts`** wraps fetch, rejects with typed `AppError` subclasses on non-2xx.
- **Error boundaries per feature** so one feature's crash doesn't take down the app.
- **Toast / notification** for user-facing errors from `DomainError`s; generic "something went wrong" for unknown.
- **`correlationId` shown in error UI** so users can report issues traceably.
