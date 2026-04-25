import { describe, expect, it } from 'vitest';

import { echoInputSchema, handleEcho } from '../src/echo.js';

describe('echo tool', () => {
  it('returns the message in text content', () => {
    const result = handleEcho({ message: 'hello world' });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: 'hello world' });
  });

  it('handles an empty string message', () => {
    const result = handleEcho({ message: '' });
    expect(result.content[0]?.text).toBe('');
  });

  it('echoInputSchema validates a message string', () => {
    const parsed = echoInputSchema.safeParse({ message: 'test' });
    expect(parsed.success).toBe(true);
  });

  it('echoInputSchema rejects missing message', () => {
    const parsed = echoInputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});
