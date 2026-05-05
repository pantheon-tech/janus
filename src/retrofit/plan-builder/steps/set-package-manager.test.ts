import { describe, expect, it } from 'vitest';
import { generateSetPackageManagerStep } from './set-package-manager.js';

describe('generateSetPackageManagerStep', () => {
  it('returns null when only pnpm-lock.yaml present', () => {
    expect(generateSetPackageManagerStep(['pnpm-lock.yaml'])).toBeNull();
  });

  it('returns null when no lockfiles', () => {
    expect(generateSetPackageManagerStep([])).toBeNull();
  });

  it('emits delete_file for package-lock.json + yarn.lock', () => {
    const step = generateSetPackageManagerStep(['package-lock.json', 'yarn.lock']);
    expect(step).not.toBeNull();
    expect(step?.id).toBe('set-package-manager');
    expect(step?.operations.map((o) => o.op)).toEqual(['delete_file', 'delete_file']);
    expect(step?.commit_paths.slice().sort()).toEqual(['package-lock.json', 'yarn.lock']);
  });

  it('keeps pnpm-lock.yaml even when other lockfiles present', () => {
    const step = generateSetPackageManagerStep(['pnpm-lock.yaml', 'package-lock.json']);
    expect(step).not.toBeNull();
    expect(step?.operations).toHaveLength(1);
    expect((step?.operations[0] as { path: string }).path).toBe('package-lock.json');
  });
});
