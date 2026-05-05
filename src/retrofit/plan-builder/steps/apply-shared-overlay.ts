import type {
  BaselineFileStatus,
  Operation,
  OverlayTree,
  Plan,
  Sha256,
} from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

const ROOT_DOTFILES = new Set([
  '.editorconfig',
  '.gitattributes',
  '.gitignore',
  '.nvmrc',
  '.node-version',
  '.env.example',
]);
const ROOT_CONFIGS = new Set([
  'biome.jsonc',
  'lefthook.yml',
  'commitlint.config.js',
  'tsconfig.base.json',
  'tsconfig.json',
  'vitest.config.ts',
  'package.json',
]);
const ROOT_DOCS = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'LICENSE',
  'SECURITY.md',
  'CODEOWNERS',
]);

export type ApplySharedCtx = {
  has_user_gitignore: boolean;
  gitignore_lines: string[];
  /**
   * Paths the archetype overlay also writes — already-merged with shared content
   * by overlay-tree. Skip these in the shared step so the per-file write_file op
   * is emitted exactly once (in apply-archetype-overlay).
   */
  archetype_only: Set<string>;
};

export function generateApplySharedOverlaySteps(
  tree: OverlayTree,
  baseline: BaselineFileStatus[],
  ctx: ApplySharedCtx,
): Step[] {
  const buckets = new Map<string, string[]>();
  for (const path of tree.keys()) {
    if (path.startsWith('.claude/')) continue;
    if (ctx.archetype_only.has(path)) continue;
    const group = bucketFor(path);
    if (!group) continue;
    const arr = buckets.get(group) ?? [];
    arr.push(path);
    buckets.set(group, arr);
  }

  const steps: Step[] = [];
  for (const [group, paths] of buckets) {
    paths.sort();
    const operations: Operation[] = paths.map((p) => writeFileOp(p, tree, baseline));
    const commit_paths = [...paths];

    if (group === 'root-dotfiles' && ctx.gitignore_lines.length > 0) {
      if (ctx.has_user_gitignore) {
        operations.push({
          op: 'gitignore_merge',
          lines: ctx.gitignore_lines,
        });
      } else {
        operations.push({
          op: 'write_file',
          path: '.gitignore',
          content: `${ctx.gitignore_lines.join('\n')}\n`,
        });
      }
      commit_paths.push('.gitignore');
    }

    steps.push({
      id: group,
      category: 'apply-shared-overlay',
      title: titleFor(group),
      commit_message: commitMessageFor(group),
      preconditions: [],
      operations,
      commit_paths: commit_paths.sort(),
    });
  }

  return steps;
}

function bucketFor(path: string): string | undefined {
  if (ROOT_DOTFILES.has(path)) return 'root-dotfiles';
  if (ROOT_CONFIGS.has(path)) return 'root-configs';
  if (ROOT_DOCS.has(path)) return 'root-docs';
  const firstSeg = path.split('/')[0];
  if (firstSeg === undefined || firstSeg === path) return undefined;
  return `apply-shared-overlay/${firstSeg}`;
}

function writeFileOp(path: string, tree: OverlayTree, baseline: BaselineFileStatus[]): Operation {
  const entry = tree.get(path);
  if (!entry) throw new Error(`overlay tree missing entry for ${path}`);
  const status = baseline.find((b) => b.path === path);
  const includeMode = entry.mode !== 0o644;
  const includePreHash =
    status?.status === 'present_differs' && status.pre_state_hash !== undefined;
  const op: Operation = {
    op: 'write_file',
    path,
    content: entry.content.toString('utf8'),
    ...(includeMode ? { mode: entry.mode } : {}),
    ...(includePreHash ? { pre_state_hash: status.pre_state_hash as Sha256, overwrite: true } : {}),
  };
  return op;
}

function titleFor(group: string): string {
  switch (group) {
    case 'root-dotfiles':
      return 'Apply janus root dotfiles';
    case 'root-configs':
      return 'Apply janus root configs';
    case 'root-docs':
      return 'Apply janus root docs';
    default:
      return `Apply janus shared overlay (${group.replace('apply-shared-overlay/', '')})`;
  }
}

function commitMessageFor(group: string): string {
  switch (group) {
    case 'root-dotfiles':
      return 'chore: apply janus root dotfiles';
    case 'root-configs':
      return 'chore: apply janus root configs';
    case 'root-docs':
      return 'chore: apply janus root docs';
    default:
      return `chore: apply janus shared overlay (${group.replace('apply-shared-overlay/', '')})`;
  }
}
