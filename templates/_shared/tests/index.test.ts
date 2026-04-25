import { describe, expect, it } from 'vitest';

import { greet } from '../src/index.js';

describe('greet', () => {
  it('builds a greeting', () => {
    expect(greet('Janus')).toBe('Hello, Janus!');
  });
});
