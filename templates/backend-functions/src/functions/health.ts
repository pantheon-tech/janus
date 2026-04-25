import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

/**
 * Health check handler — exported for unit testing.
 * Register the HTTP trigger separately so tests can import the handler
 * without triggering `app.http()` side effects.
 */
export async function healthHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  const body: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
  return {
    status: 200,
    jsonBody: body,
  };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: healthHandler,
});
