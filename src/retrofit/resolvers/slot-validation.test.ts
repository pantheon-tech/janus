import { describe, expect, it } from 'vitest';
import { normalizeNodeVersion, validateSlot } from './slot-validation.js';

describe('validateSlot', () => {
  it('accepts a valid workload', () => {
    expect(validateSlot('workload', 'foo').ok).toBe(true);
    expect(validateSlot('workload', 'fooservice').ok).toBe(true);
    expect(validateSlot('workload', 'foo123').ok).toBe(true);
  });

  it('rejects workload too short, too long, with caps, with hyphens', () => {
    expect(validateSlot('workload', 'fo').ok).toBe(false);
    expect(validateSlot('workload', 'aaaaaaaaaaaaa').ok).toBe(false);
    expect(validateSlot('workload', 'Foo').ok).toBe(false);
    expect(validateSlot('workload', 'foo-bar').ok).toBe(false);
    expect(validateSlot('workload', '1foo').ok).toBe(false);
  });

  it('accepts valid github_org', () => {
    expect(validateSlot('github_org', 'pantheon-tech').ok).toBe(true);
    expect(validateSlot('github_org', 'a').ok).toBe(true);
    expect(validateSlot('github_org', 'a'.repeat(39)).ok).toBe(true);
  });

  it('rejects github_org with leading or trailing hyphen, too long, bad chars', () => {
    expect(validateSlot('github_org', '-foo').ok).toBe(false);
    expect(validateSlot('github_org', 'foo-').ok).toBe(false);
    expect(validateSlot('github_org', 'a'.repeat(40)).ok).toBe(false);
    expect(validateSlot('github_org', 'foo_bar').ok).toBe(false);
  });

  it('accepts a valid email', () => {
    expect(validateSlot('author_email', 'daniel@skipper.kiwi').ok).toBe(true);
    expect(validateSlot('author_email', 'a@b.co').ok).toBe(true);
  });

  it('rejects malformed email', () => {
    expect(validateSlot('author_email', 'no-at-sign').ok).toBe(false);
    expect(validateSlot('author_email', 'a@b').ok).toBe(false);
    expect(validateSlot('author_email', '@b.com').ok).toBe(false);
  });

  it('accepts node_version as bare integer', () => {
    expect(validateSlot('node_version', '20').ok).toBe(true);
    expect(validateSlot('node_version', '24').ok).toBe(true);
  });

  it('rejects node_version that is not a bare integer', () => {
    expect(validateSlot('node_version', '20.0.0').ok).toBe(false);
    expect(validateSlot('node_version', '^20').ok).toBe(false);
  });

  it('passes through other slots without complaint', () => {
    expect(validateSlot('license', 'Apache-2.0').ok).toBe(true);
    expect(validateSlot('description', 'anything goes here, even punctuation!').ok).toBe(true);
  });
});

describe('normalizeNodeVersion', () => {
  it('extracts leading integer from common range expressions', () => {
    expect(normalizeNodeVersion('24')).toBe('24');
    expect(normalizeNodeVersion('>=24')).toBe('24');
    expect(normalizeNodeVersion('^20.0.0')).toBe('20');
    expect(normalizeNodeVersion('24.x')).toBe('24');
    expect(normalizeNodeVersion('24.5.0')).toBe('24');
    expect(normalizeNodeVersion('  18  ')).toBe('18');
  });

  it('returns undefined for unparseable input', () => {
    expect(normalizeNodeVersion('latest')).toBeUndefined();
    expect(normalizeNodeVersion('')).toBeUndefined();
    expect(normalizeNodeVersion('lts/iron')).toBeUndefined();
  });
});
