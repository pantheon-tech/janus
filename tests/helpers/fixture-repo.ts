import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_ROOT = fileURLToPath(new URL('../fixtures/repos/', import.meta.url));

export type Fixture = {
  dir: string;
  cleanup: () => void;
};

export function materializeFixture(name: string): Fixture {
  const src = join(FIXTURES_ROOT, name);
  if (!existsSync(src)) {
    throw new Error(`fixture not found: ${name} (looked in ${src})`);
  }

  const dir = mkdtempSync(join(tmpdir(), 'janus-fixture-'));
  cpSync(src, dir, { recursive: true });

  const git = (cmd: string) =>
    execSync(`git ${cmd}`, {
      cwd: dir,
      stdio: 'pipe',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'janus-test',
        GIT_AUTHOR_EMAIL: 'janus@test.local',
        GIT_COMMITTER_NAME: 'janus-test',
        GIT_COMMITTER_EMAIL: 'janus@test.local',
      },
    });

  git('init -q -b main');
  git('config commit.gpgsign false');
  git('add -A');
  git('commit -q --allow-empty -m "fixture: initial commit"');

  const setupScript = join(src, 'setup.sh');
  if (existsSync(setupScript)) {
    execSync(`bash "${setupScript}"`, { cwd: dir, stdio: 'pipe' });
  }

  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

export function commitFile(dir: string, relPath: string, content: string, message = 'fixture: update') {
  const full = join(dir, relPath);
  writeFileSync(full, content);
  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync(`git commit -q -m "${message}"`, {
    cwd: dir,
    stdio: 'pipe',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'janus-test',
      GIT_AUTHOR_EMAIL: 'janus@test.local',
      GIT_COMMITTER_NAME: 'janus-test',
      GIT_COMMITTER_EMAIL: 'janus@test.local',
    },
  });
}
