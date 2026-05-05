import { describe, expect, it } from 'vitest';
import { generateInstallDepsStep } from './install-deps.js';

describe('generateInstallDepsStep', () => {
  it('returns null for monorepo-root', () => {
    expect(generateInstallDepsStep('monorepo-root')).toBeNull();
  });

  it('emits a shell op with pnpm install for other archetypes', () => {
    const step = generateInstallDepsStep('generic-ts');
    expect(step).not.toBeNull();
    expect(step?.id).toBe('install-deps');
    expect(step?.operations).toHaveLength(1);
    const op = step?.operations[0];
    expect(op?.op).toBe('shell');
    expect((op as { command: string }).command).toBe('pnpm install');
    expect(step?.commit_paths).toEqual(['pnpm-lock.yaml']);
  });
});
