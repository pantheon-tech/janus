import { describe, expect, it, vi } from 'vitest';

vi.mock('../plan-builder/diagnose.js', () => ({
  diagnose: vi.fn(),
}));
vi.mock('../analyzer/unrecognized-tools-allowlist.js', () => ({
  loadUnrecognizedToolsAllowlist: vi.fn(async () => []),
}));

import { JanusError } from '../errors.js';
import { diagnose } from '../plan-builder/diagnose.js';
import { runDiagnose } from './diagnose-cmd.js';

describe('runDiagnose exit-code mapping', () => {
  it('returns 1 when --plugin lacks @ separator', async () => {
    const code = await runDiagnose([
      '--archetype',
      'generic-ts',
      '--non-interactive',
      '--plugin',
      'banana-claude',
    ]);
    expect(code).toBe(1);
  });

  it('returns 1 when diagnose() throws a JanusError', async () => {
    vi.mocked(diagnose).mockRejectedValueOnce(
      new JanusError('INVALID_ARCHETYPE', 'invalid archetype'),
    );
    const code = await runDiagnose(['--archetype', 'generic-ts', '--non-interactive']);
    expect(code).toBe(1);
  });

  it('returns 2 when diagnose() throws a non-JanusError (internal error fallback)', async () => {
    vi.mocked(diagnose).mockRejectedValueOnce(new TypeError('boom'));
    const code = await runDiagnose(['--archetype', 'generic-ts', '--non-interactive']);
    expect(code).toBe(2);
  });
});
