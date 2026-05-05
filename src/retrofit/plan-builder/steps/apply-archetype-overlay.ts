import type {
  BaselineFileStatus,
  Operation,
  OverlayTree,
  Plan,
  Sha256,
} from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

const DISPLACED_FILE_PATTERNS = [
  /^\.eslintrc\./,
  /^eslint\.config\./,
  /^\.prettierrc/,
  /^prettier\.config\./,
  /^jest\.config\./,
  /^\.husky\//,
];

export function generateApplyArchetypeOverlaySteps(
  tree: OverlayTree,
  baseline: BaselineFileStatus[],
  archetypeOnly: Set<string>,
): Step[] {
  for (const path of archetypeOnly) {
    if (DISPLACED_FILE_PATTERNS.some((re) => re.test(path))) {
      throw new Error(
        `ARCHETYPE_DISPLACED_TOOL_CONFLICT: archetype ships ${path}, which is in the displaced-tools allowlist`,
      );
    }
  }

  const buckets = new Map<string, string[]>();
  for (const path of archetypeOnly) {
    const segs = path.split('/');
    const head = segs.length === 1 ? path : segs[0];
    if (head === undefined) continue;
    const group = `apply-archetype-overlay/${head}`;
    const arr = buckets.get(group) ?? [];
    arr.push(path);
    buckets.set(group, arr);
  }

  const steps: Step[] = [];
  for (const [group, paths] of buckets) {
    paths.sort();
    const operations: Operation[] = paths.map((p) => writeFileOp(p, tree, baseline));
    steps.push({
      id: group,
      category: 'apply-archetype-overlay',
      title: `Apply archetype overlay (${group.replace('apply-archetype-overlay/', '')})`,
      commit_message: `chore: apply archetype overlay (${group.replace(
        'apply-archetype-overlay/',
        '',
      )})`,
      preconditions: [],
      operations,
      commit_paths: [...paths].sort(),
    });
  }
  return steps;
}

function writeFileOp(path: string, tree: OverlayTree, baseline: BaselineFileStatus[]): Operation {
  const entry = tree.get(path);
  if (!entry) throw new Error(`overlay tree missing entry for ${path}`);
  const status = baseline.find((b) => b.path === path);
  const includeMode = entry.mode !== 0o644;
  const includePreHash =
    status?.status === 'present_differs' && status.pre_state_hash !== undefined;
  return {
    op: 'write_file',
    path,
    content: entry.content.toString('utf8'),
    ...(includeMode ? { mode: entry.mode } : {}),
    ...(includePreHash ? { pre_state_hash: status.pre_state_hash as Sha256, overwrite: true } : {}),
  };
}
