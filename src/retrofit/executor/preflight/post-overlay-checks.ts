import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { JanusError } from '../../errors.js';

export function runPostOverlayChecks(repoRoot: string, targetPaths: Set<string>): void {
  // #6 symlinks in target paths — use lstat (does NOT follow links) so we detect a
  // symlink ITSELF rather than the kind of file it resolves to.
  for (const rel of targetPaths) {
    const full = join(repoRoot, rel);
    if (existsSync(full)) {
      const lstat = lstatSync(full);
      if (lstat.isSymbolicLink()) {
        throw new JanusError('TARGET_PATH_SYMLINK', `symlink found at target path: ${rel}`);
      }
    }
  }

  // #7 case-insensitive collision: for each target path, look for an existing sibling
  // at the same parent dir whose filename differs only by case.
  for (const rel of targetPaths) {
    const target = join(repoRoot, rel);
    if (existsSync(target)) continue;
    const parentDir = dirname(target);
    if (!existsSync(parentDir)) continue;
    const baseName = rel.split('/').pop();
    if (!baseName) continue;
    const lc = baseName.toLowerCase();
    let entries: string[] = [];
    try {
      entries = readdirSync(parentDir);
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e !== baseName && e.toLowerCase() === lc) {
        throw new JanusError(
          'CASE_COLLISION',
          `existing ${join(dirname(rel), e)} would collide with overlay target ${rel}`,
        );
      }
    }
  }
}
