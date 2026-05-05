import { describe, expect, it } from 'vitest';
import type { Plan } from '../types/index.js';
import { canonicalizePayload, hashPayload, sortSteps, sortWarnings } from './determinism.js';

describe('sortSteps', () => {
  it('orders by category number first, then alphabetical id', () => {
    const steps: Plan['payload']['steps'] = [
      {
        id: 'apply-shared-overlay/.github',
        category: 'apply-shared-overlay',
        title: 'gh',
        commit_message: 'chore: gh',
        preconditions: [],
        operations: [],
        commit_paths: [],
      },
      {
        id: 'displace-eslint',
        category: 'displace-tools',
        title: 'e',
        commit_message: 'chore: e',
        preconditions: [],
        operations: [],
        commit_paths: [],
      },
      {
        id: 'install-deps',
        category: 'install-deps',
        title: 'i',
        commit_message: 'chore: i',
        preconditions: [],
        operations: [],
        commit_paths: [],
      },
      {
        id: 'apply-shared-overlay/infra',
        category: 'apply-shared-overlay',
        title: 'i2',
        commit_message: 'chore: i2',
        preconditions: [],
        operations: [],
        commit_paths: [],
      },
      {
        id: 'set-package-manager',
        category: 'set-package-manager',
        title: 'p',
        commit_message: 'chore: p',
        preconditions: [],
        operations: [],
        commit_paths: [],
      },
      {
        id: 'root-dotfiles',
        category: 'apply-shared-overlay',
        title: 'r',
        commit_message: 'chore: r',
        preconditions: [],
        operations: [],
        commit_paths: [],
      },
    ];
    const sorted = sortSteps(steps);
    expect(sorted.map((s) => s.id)).toEqual([
      'displace-eslint',
      'set-package-manager',
      'apply-shared-overlay/.github',
      'apply-shared-overlay/infra',
      'root-dotfiles',
      'install-deps',
    ]);
  });
});

describe('sortWarnings', () => {
  it('orders by (code, evidence[0], message)', () => {
    const ws = [
      { code: 'MODULE_TYPE_CHANGE', message: 'b', evidence: ['package.json:type'] },
      { code: 'UNKNOWN_TOOL', message: 'a', evidence: [] },
      { code: 'MODULE_TYPE_CHANGE', message: 'a', evidence: ['package.json:type'] },
      { code: 'UNKNOWN_TOOL', message: 'a', evidence: ['z'] },
    ];
    const sorted = sortWarnings(ws);
    expect(sorted).toEqual([
      { code: 'MODULE_TYPE_CHANGE', message: 'a', evidence: ['package.json:type'] },
      { code: 'MODULE_TYPE_CHANGE', message: 'b', evidence: ['package.json:type'] },
      { code: 'UNKNOWN_TOOL', message: 'a', evidence: [] },
      { code: 'UNKNOWN_TOOL', message: 'a', evidence: ['z'] },
    ]);
  });
});

describe('canonicalizePayload + hashPayload', () => {
  it('produces byte-stable output for equivalent inputs in different key orders', () => {
    const a = { z: 1, a: { y: 2, b: 3 } };
    const b = { a: { b: 3, y: 2 }, z: 1 };
    expect(canonicalizePayload(a)).toBe(canonicalizePayload(b));
    expect(hashPayload(a)).toBe(hashPayload(b));
  });

  it('hash output starts with sha256:', () => {
    expect(hashPayload({})).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
