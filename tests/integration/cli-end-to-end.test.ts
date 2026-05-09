import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { materializeFixture } from '../helpers/fixture-repo.js';

const JANUS_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const BIN = join(JANUS_ROOT, 'bin/janus.js');

describe('CLI end-to-end (greenfield + generic-ts)', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups.length = 0;
  });

  it('runs diagnose then retrofit and produces a janus/retrofit branch with commits', () => {
    // Build first — bin/janus.js dispatches to dist/retrofit/cli/.
    execSync('pnpm build', { cwd: JANUS_ROOT, stdio: 'pipe' });

    const fx = materializeFixture('greenfield');
    cleanups.push(fx.cleanup);
    execSync('git remote add origin https://github.com/test/foo.git', { cwd: fx.dir, stdio: 'pipe' });

    // diagnose
    execFileSync('node', [BIN, 'diagnose',
      '--archetype', 'generic-ts',
      '--non-interactive',
      '--slot', 'author=Test',
      '--slot', 'author_email=t@e.com',
      '--slot', 'description=hello',
    ], { cwd: fx.dir, stdio: 'pipe' });
    expect(existsSync(join(fx.dir, '.janus-retrofit.json'))).toBe(true);

    // retrofit
    execFileSync('node', [BIN, 'retrofit',
      '--plan', '.janus-retrofit.json',
      '--no-remote-check',
    ], { cwd: fx.dir, stdio: 'pipe' });

    // Branch exists with commits
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: fx.dir }).toString().trim();
    expect(branch).toBe('janus/retrofit');
    const log = execSync('git log --oneline', { cwd: fx.dir }).toString();
    expect(log.split('\n').filter(Boolean).length).toBeGreaterThan(2);
    expect(existsSync(join(fx.dir, '.janus.json'))).toBe(true);
    expect(existsSync(join(fx.dir, 'biome.jsonc'))).toBe(true);
  }, 120_000);
});
