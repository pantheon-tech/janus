import type { DisplacedTool, Plan } from '../../types/index.js';

type Step = Plan['payload']['steps'][number];

export function generateDisplaceToolsSteps(tools: DisplacedTool[]): Step[] {
  return tools.flatMap((tool) => {
    if (tool.name === 'husky') return []; // Task 4 handles husky specially.
    return [generateOne(tool)];
  });
}

function generateOne(tool: DisplacedTool): Step {
  const fileEvidence = tool.evidence.filter((e) => !e.startsWith('package.json:'));
  const operations: Step['operations'] = [];

  for (const path of fileEvidence) {
    operations.push({ op: 'delete_file', path });
  }
  operations.push({
    op: 'json_remove',
    path: 'package.json',
    pointer: `/devDependencies/${tool.name}`,
  });
  operations.push({
    op: 'json_remove_matching',
    path: 'package.json',
    pointer: '/scripts',
    value_regex: `\\b${escapeRegex(tool.name)}\\b`,
  });

  const commit_paths = [...new Set([...fileEvidence, 'package.json'])].sort();

  return {
    id: `displace-${tool.name}`,
    category: 'displace-tools',
    title: `Remove ${tool.name}`,
    commit_message: commitMessageFor(tool.name),
    preconditions: [],
    operations,
    commit_paths,
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function commitMessageFor(name: DisplacedTool['name']): string {
  switch (name) {
    case 'eslint':
      return 'chore: remove eslint in favor of biome';
    case 'prettier':
      return 'chore: remove prettier in favor of biome';
    case 'jest':
      return 'chore: remove jest in favor of vitest';
    case 'commitlint_old':
      return 'chore: replace commitlint config';
    case 'husky':
      return 'chore: remove husky in favor of lefthook';
  }
}
