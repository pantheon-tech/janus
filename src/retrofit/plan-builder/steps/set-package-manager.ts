import type { Plan } from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

export function generateSetPackageManagerStep(lockfiles_present: string[]): Step | null {
  const toDelete = lockfiles_present.filter((l) => l !== 'pnpm-lock.yaml');
  if (toDelete.length === 0) return null;
  toDelete.sort();
  return {
    id: 'set-package-manager',
    category: 'set-package-manager',
    title: 'Switch to pnpm by removing other lockfiles',
    commit_message: 'chore: switch to pnpm package manager',
    preconditions: [],
    operations: toDelete.map((path) => ({ op: 'delete_file', path })),
    commit_paths: toDelete,
  };
}
