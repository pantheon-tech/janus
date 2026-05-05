import type { Plan } from '../../types/index.js';
import { SHELL_WHITELIST } from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

export function generateInstallDepsStep(archetype: string): Step | null {
  if (archetype === 'monorepo-root') return null;
  return {
    id: 'install-deps',
    category: 'install-deps',
    title: 'Install dependencies with pnpm',
    commit_message: 'chore: install dependencies and commit lockfile',
    preconditions: [],
    operations: [{ op: 'shell', command: SHELL_WHITELIST[0] }],
    commit_paths: ['pnpm-lock.yaml'],
  };
}
