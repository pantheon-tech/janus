import { existsSync, readFileSync } from 'node:fs';

/**
 * Build an `is_excluded(rel)` predicate from `.exclude` lines, matching
 * `scripts/scaffold.sh:is_excluded()` semantics.
 */
export function buildIsExcluded(patterns: string[]): (rel: string) => boolean {
  const cleaned = patterns
    .map((p) => p.replace(/\r$/, '').trim())
    .filter((p) => p && !p.startsWith('#'));

  return (rel: string): boolean => {
    for (const pattern of cleaned) {
      if (pattern.endsWith('/')) {
        const dir = pattern.slice(0, -1);
        if (rel === dir || rel.startsWith(`${dir}/`)) return true;
      } else if (rel === pattern) {
        return true;
      }
    }
    return false;
  };
}

export function readExcludeFile(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8').split('\n');
}
