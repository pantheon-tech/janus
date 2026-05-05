import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
  const gitignoreLines = { lines: [] as string[] };
  const sharedRoot = join(janusRoot, 'templates/_shared');
  const archeRoot = join(janusRoot, 'templates', archetype);
  const excludeLines = readExcludeFile(join(archeRoot, '.exclude'));
  const isExcluded = buildIsExcluded(excludeLines);

  // Pass 1: shared walk (also captures gitignore lines).
  walkTree({
    janusRoot,
    base: sharedRoot,
    current: sharedRoot,
    isExcluded,
    slots,
    tree,
    gitignoreLines,
    opts,
  });

  // Pass 2: archetype walk (overlay-with-replace).
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

  return { tree, gitignore_lines: gitignoreLines.lines, archetype_only };
}

type WalkArgs = {
  janusRoot: string;
  base: string;
  current: string;
  isExcluded: (rel: string) => boolean;
  slots: Record<string, string>;
  tree: OverlayTree;
  gitignoreLines: { lines: string[] };
  opts: BuildOverlayOpts;
};

function walkTree(args: WalkArgs): void {
  const { janusRoot, base, current, isExcluded, slots, tree, gitignoreLines, opts } = args;
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

    // .gitignore is special-cased: capture lines for plan-builder to emit
    // gitignore_merge instead of a write_file op. Do NOT add it to the tree.
    if (rel === '.gitignore') {
      const content = readFileSync(full, 'utf8');
      gitignoreLines.lines = content
        .split('\n')
        .map((l) => l.replace(/\r$/, ''))
        .filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
      continue;
    }

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
      const sharedPkg = sharedPkgEntry ? JSON.parse(sharedPkgEntry.content.toString('utf8')) : {};
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

/**
 * Merge the user's existing package.json into the overlay tree's package.json,
 * mutating the tree entry in place. User content is the LEFT operand; janus
 * content (already in the tree) is the RIGHT operand. Per jq `*` semantics,
 * janus wins on every key it sets; user-only keys/scripts survive.
 *
 * Caller decides whether to invoke this (only when the user has a package.json).
 */
export function mergeUserPackageJson(tree: OverlayTree, userPkg: Record<string, unknown>): void {
  const janusEntry = tree.get('package.json');
  if (!janusEntry) {
    tree.set('package.json', {
      content: Buffer.from(`${JSON.stringify(userPkg, null, 2)}\n`, 'utf8'),
      mode: 0o644,
    });
    return;
  }
  const janusPkg = JSON.parse(janusEntry.content.toString('utf8'));
  const merged = jqDeepMerge(userPkg, janusPkg);
  tree.set('package.json', {
    content: Buffer.from(`${JSON.stringify(merged, null, 2)}\n`, 'utf8'),
    mode: 0o644,
  });
}
