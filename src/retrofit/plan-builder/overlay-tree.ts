import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import type { OverlayTree } from '../types/index.js';
import { buildIsExcluded, readExcludeFile } from './exclude.js';

export type BuildOverlayOpts = {
  /** Skip .tmpl rendering (used by walker-only tests). Tasks 16+ remove this from production paths. */
  skipTmpl?: boolean;
};

export function buildOverlayTree(
  janusRoot: string,
  archetype: string,
  _slots: Record<string, string>,
  opts: BuildOverlayOpts = {},
): OverlayTree {
  const tree: OverlayTree = new Map();

  const sharedRoot = join(janusRoot, 'templates/_shared');
  const archeRoot = join(janusRoot, 'templates', archetype);

  const excludeLines = readExcludeFile(join(archeRoot, '.exclude'));
  const isExcluded = buildIsExcluded(excludeLines);

  walkSharedTree(sharedRoot, sharedRoot, isExcluded, tree, opts);

  // Pass 2: archetype walk — Task 17.
  // Pass 3: gitignore special-case — Task 18.
  // Pass 4: user-side package.json merge — Task 19.

  return tree;
}

function walkSharedTree(
  sharedRoot: string,
  current: string,
  isExcluded: (rel: string) => boolean,
  tree: OverlayTree,
  opts: BuildOverlayOpts,
): void {
  for (const entry of readdirSync(current)) {
    const full = join(current, entry);
    const stat = statSync(full);
    const rel = toPosix(relative(sharedRoot, full));

    if (stat.isDirectory()) {
      walkSharedTree(sharedRoot, full, isExcluded, tree, opts);
      continue;
    }
    if (!stat.isFile()) continue;

    if (isExcluded(rel)) continue;

    if (rel.endsWith('.tmpl')) {
      if (opts.skipTmpl) continue;
      // Task 16 lands real .tmpl rendering.
      continue;
    }

    const content = readFileSync(full);
    const mode = computeMode(rel);
    tree.set(rel, { content, mode });
  }
}

function computeMode(rel: string): number {
  if (rel.startsWith('.claude/hooks/')) return 0o755;
  return 0o644;
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join(posix.sep);
}
