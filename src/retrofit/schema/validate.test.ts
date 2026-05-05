import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateMarker, validatePlan } from './validate.js';

const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'tests', 'fixtures');

function loadJson(relPath: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, relPath), 'utf8'));
}

describe('validatePlan', () => {
  it('accepts a minimal valid plan', () => {
    const result = validatePlan(loadJson('plans/minimal-valid.json'));
    expect(result.ok).toBe(true);
  });

  it('rejects a plan missing schema_version', () => {
    const result = validatePlan(loadJson('plans/invalid-missing-schema-version.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => /schema_version/.test(e))).toBe(true);
    }
  });

  it('rejects a plan with an unknown op', () => {
    const result = validatePlan(loadJson('plans/invalid-bad-op.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('rejects a non-object input', () => {
    const result = validatePlan('not a plan');
    expect(result.ok).toBe(false);
  });
});

describe('validateMarker', () => {
  it('accepts a minimal valid marker', () => {
    const result = validateMarker(loadJson('markers/minimal-valid.json'));
    expect(result.ok).toBe(true);
  });

  it('rejects a marker missing required fields', () => {
    const result = validateMarker({ schema_version: '1' });
    expect(result.ok).toBe(false);
  });
});
