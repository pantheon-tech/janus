import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import type { OverlayResult, OverlayTree } from '../types/index.js';
import { buildIsExcluded, readExcludeFile } from './exclude.js';
import { jqDeepMerge } from './jq-merge.js';
import { renderMo } from './render-mo.js';

export type BuildOverlayOpts = {
  skipTmpl?: boolean;
};

export function buildOverlayTree(
  janusRoot: string,
  archetype: string,
  slots: Record<string, string>,
  opts: BuildOverlayOpts = {},
): OverlayResult {
  const tree: OverlayTree = new Map();
  const archetype_only = new Set<string>();
  const sharedRoot = join(janusRoot, 'templates/_shared');
  const archeRoot = join(janusRoot, 'templates', archetype);
  const excludeLines = readExcludeFile(join(archeRoot, '.exclude'));
  const isExcluded = buildIsExcluded(excludeLines);

  // Pass 1: shared walk.
  walkTree({ janusRoot, base: sharedRoot, current: sharedRoot, isExcluded, slots, tree, opts });

  // Pass 2: archetype walk (overlay-with-replace). Records every added/overwritten
  // path in `archetype_only` so Plan 3 can emit a separate apply-archetype-overlay step.
  if (existsSync(archeRoot)) {
    walkArchetype({
      janusRoot,
      archeRoot,
      current: archeRoot,
      isExcluded,
      slots,
      tree,
      archetype_only,
      opts,
    });
  }

  // Pass 3: if archetype excludes infra/, strip deploy:* scripts from package.json.
  if (excludesInfra(excludeLines)) {
    pruneDeployScripts(tree);
    archetype_only.add('package.json');
  }

  // Task 18 fills gitignore_lines.
  return { tree, gitignore_lines: [], archetype_only };
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

type WalkArchetypeArgs = {
  janusRoot: string;
  archeRoot: string;
  current: string;
  isExcluded: (rel: string) => boolean;
  slots: Record<string, string>;
  tree: OverlayTree;
  archetype_only: Set<string>;
  opts: BuildOverlayOpts;
};

function walkArchetype(args: WalkArchetypeArgs): void {
  const { janusRoot, archeRoot, current, slots, tree, archetype_only, opts } = args;
  for (const entry of readdirSync(current)) {
    const full = join(current, entry);
    const stat = statSync(full);
    const rel = toPosix(relative(archeRoot, full));

    // Per-file skip rules (mirroring scaffold.sh archetype-walk).
    if (rel === '.exclude' || rel === 'README.md' || rel === 'slots.json') continue;

    if (stat.isDirectory()) {
      walkArchetype({ ...args, current: full });
      continue;
    }
    if (!stat.isFile()) continue;

    // .env.example: append to shared, don't replace.
    if (rel === '.env.example') {
      const archeContent = readFileSync(full);
      const existing = tree.get('.env.example');
      const merged = existing
        ? Buffer.concat([existing.content, Buffer.from('\n'), archeContent])
        : archeContent;
      tree.set('.env.example', { content: merged, mode: 0o644 });
      archetype_only.add('.env.example');
      continue;
    }

    // package.json.tmpl: render then jq-deep-merge over the shared package.json in the tree.
    if (rel === 'package.json.tmpl') {
      if (opts.skipTmpl) continue;
      const archeRendered = renderMo(janusRoot, full, slots);
      const sharedPkgEntry = tree.get('package.json');
      const sharedPkg = sharedPkgEntry
        ? JSON.parse(sharedPkgEntry.content.toString('utf8'))
        : {};
      const archePkg = JSON.parse(archeRendered.toString('utf8'));
      const merged = jqDeepMerge(sharedPkg, archePkg);
      tree.set('package.json', {
        content: Buffer.from(`${JSON.stringify(merged, null, 2)}\n`, 'utf8'),
        mode: 0o644,
      });
      archetype_only.add('package.json');
      continue;
    }

    // Render-or-copy with overlay-replace.
    if (rel.endsWith('.tmpl')) {
      if (opts.skipTmpl) continue;
      const rendered = renderMo(janusRoot, full, slots);
      const outRel = rel.slice(0, -'.tmpl'.length);
      tree.set(outRel, { content: rendered, mode: computeMode(outRel) });
      archetype_only.add(outRel);
      continue;
    }

    tree.set(rel, { content: readFileSync(full), mode: computeMode(rel) });
    archetype_only.add(rel);
  }
}

function excludesInfra(excludeLines: string[]): boolean {
  return excludeLines.some((l) => l.replace(/\r$/, '').trim() === 'infra/');
}

function pruneDeployScripts(tree: OverlayTree): void {
  const pkgEntry = tree.get('package.json');
  if (!pkgEntry) return;
  const pkg = JSON.parse(pkgEntry.content.toString('utf8'));
  if (pkg.scripts) {
    delete pkg.scripts['deploy:staging'];
    delete pkg.scripts['deploy:prod'];
  }
  tree.set('package.json', {
    content: Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`, 'utf8'),
    mode: 0o644,
  });
}

function computeMode(rel: string): number {
  if (rel.startsWith('.claude/hooks/')) return 0o755;
  return 0o644;
}

function toPosix(p: string): string {
  return sep === '/' ? p : p.split(sep).join(posix.sep);
}
