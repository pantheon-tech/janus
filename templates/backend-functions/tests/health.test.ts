import { describe, expect, it } from 'vitest';

import { type HealthResponse, healthHandler } from '../src/functions/health.js';

// Minimal stubs — healthHandler does not use request or context.
const stubRequest = {} as Parameters<typeof healthHandler>[0];
const stubContext = {} as Parameters<typeof healthHandler>[1];

describe('healthHandler', () => {
  it('returns status 200', async () => {
    const response = await healthHandler(stubRequest, stubContext);
    expect(response.status).toBe(200);
  });

  it('returns ok status in body', async () => {
    const response = await healthHandler(stubRequest, stubContext);
    const body = response.jsonBody as HealthResponse;
    expect(body.status).toBe('ok');
  });

  it('returns a valid ISO timestamp', async () => {
    const response = await healthHandler(stubRequest, stubContext);
    const body = response.jsonBody as HealthResponse;
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
