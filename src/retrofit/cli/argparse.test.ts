import { describe, expect, it } from 'vitest';
import { parseArgs } from './argparse.js';

describe('parseArgs', () => {
  it('handles a mix of bool, string, and repeatable flags', () => {
    const r = parseArgs(['--archetype', 'generic-ts', '--non-interactive', '--slot', 'workload=foo', '--slot=author=X'], {
      string: ['archetype'],
      boolean: ['non-interactive'],
      collect: ['slot'],
    });
    expect(r.archetype).toBe('generic-ts');
    expect(r['non-interactive']).toBe(true);
    expect(r.slot).toEqual(['workload=foo', 'author=X']);
  });

  it('returns positional args separately', () => {
    const r = parseArgs(['plan.json', '--branch', 'b'], {
      string: ['branch'],
      collect: [],
      boolean: [],
    });
    expect(r._).toEqual(['plan.json']);
    expect(r.branch).toBe('b');
  });

  it('throws on --foo with no value when foo is in `string`', () => {
    expect(() => parseArgs(['--archetype'], { string: ['archetype'], boolean: [], collect: [] })).toThrow(/missing value/);
  });

  it('passes through unknown long flags as boolean true (forward compat)', () => {
    const r = parseArgs(['--mystery'], { string: [], boolean: [], collect: [] });
    expect(r.mystery).toBe(true);
  });
});
