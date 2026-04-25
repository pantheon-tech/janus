import { describe, expect, it } from 'vitest';

import { hello } from '../src/index.js';

describe('hello', () => {
  it('builds a greeting', () => {
    expect(hello('world')).toBe('Hello, world!');
  });
});
