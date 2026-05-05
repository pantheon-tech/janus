import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import type { OverlayTree } from '../types/index.js';
import { buildIsExcluded, readExcludeFile } from './exclude.js';
import { renderMo } from './render-mo.js';

export type BuildOverlayOpts = {
  skipTmpl?: boolean;
};

export function buildOverlayTree(
  janusRoot: string,
  archetype: string,
  slots: Record<string, string>,
  opts: BuildOverlayOpts = {},
): OverlayTree {
  const tree: OverlayTree = new Map();
  const sharedRoot = join(janusRoot, 'templates/_shared');
  const archeRoot = join(janusRoot, 'templates', archetype);

  const isExcluded = buildIsExcluded(readExcludeFile(join(archeRoot, '.exclude')));

  walkTree({ janusRoot, base: sharedRoot, current: sharedRoot, isExcluded, slots, tree, opts });
  // Tasks 17/18/19 add archetype walk + gitignore special-case + user-pkg merge.
  return tree;
}

type WalkArgs = {
  janusRoot: string;
  base: string;
  current: string;
  isExcluded: (rel: string) => boolean;
  slots: Record<string, string>;
  tree: OverlayTree;
  opts: BuildOverlayOpts;
};

function walkTree(args: WalkArgs): void {
  const { janusRoot, base, current, isExcluded, slots, tree, opts } = args;
  for (const entry of readdirSync(current)) {
    const full = join(current, entry);
    const stat = statSync(full);
    const rel = toPosix(relative(base, full));

    if (stat.isDirectory()) {
      walkTree({ ...args, current: full });
      continue;
    }
    if (!stat.isFile()) continue;
    if (isExcluded(rel)) continue;

    if (rel.endsWith('.tmpl')) {
      if (opts.skipTmpl) continue;
      const rendered = renderMo(janusRoot, full, slots);
      const outRel = rel.slice(0, -'.tmpl'.length);
      tree.set(outRel, { content: rendered, mode: computeMode(outRel) });
      continue;
    }

    tree.set(rel, { content: readFileSync(full), mode: computeMode(rel) });
  }
}

function computeMode(rel: string): number {
  if (rel.startsWith('.claude/hooks/')) return 0o755;
  return 0o644;
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join(posix.sep);
}
