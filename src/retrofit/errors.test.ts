import { describe, expect, it } from 'vitest';
import { JanusError, MID_EXECUTION_CODES } from './errors.js';

describe('JanusError', () => {
  it('exposes the code passed to the constructor', () => {
    const err = new JanusError('NOT_IN_GIT_REPO', 'msg');
    expect(err.code).toBe('NOT_IN_GIT_REPO');
  });

  it('exposes the optional remediation string', () => {
    const err = new JanusError('NOT_IN_GIT_REPO', 'msg', 'fix it');
    expect(err.remediation).toBe('fix it');
  });
});

describe('MID_EXECUTION_CODES', () => {
  it('contains mid-execution-only codes', () => {
    expect(MID_EXECUTION_CODES.has('PRE_STATE_HASH_MISMATCH')).toBe(true);
  });

  it('does not contain pre-flight codes', () => {
    expect(MID_EXECUTION_CODES.has('NOT_IN_GIT_REPO')).toBe(false);
  });
});
