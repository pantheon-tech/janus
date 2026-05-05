import type { ClaudeKitSnapshot, Operation, OverlayTree, Plan, Sha256 } from '../../types/index.js';
import { buildSettingsBase, type SettingsBase } from './settings-base.js';

type Step = Plan['payload']['steps'][number];

export type MergeClaudeKitOpts = {
  workload: string;
  plugins: string[];
  /** sha256 of user's existing .claude/settings.json at diagnose time, if present. */
  settings_pre_state_hash?: Sha256;
  /** sha256 of user's existing CLAUDE.md, if present. */
  claude_md_pre_state_hash?: Sha256;
};

export function generateMergeClaudeKitSteps(
  tree: OverlayTree,
  userKit: ClaudeKitSnapshot,
  opts: MergeClaudeKitOpts,
): Step[] {
  const steps: Step[] = [];
  const settings = buildSettingsBase({ workload: opts.workload, plugins: opts.plugins });

  steps.push(buildSettingsMergeStep(settings, opts.settings_pre_state_hash));

  if (tree.has('CLAUDE.md')) {
    steps.push(buildClaudeMdSnapshotStep(tree, userKit, opts.claude_md_pre_state_hash));
  }

  const skills = listEntries(tree, '.claude/skills/');
  if (skills.length > 0)
    steps.push(buildOverlayStep('claude-skills-overlay', skills, tree, 'skills'));

  const hooks = listEntries(tree, '.claude/hooks/');
  if (hooks.length > 0) steps.push(buildOverlayStep('claude-hooks-overlay', hooks, tree, 'hooks'));

  const misc = [...tree.keys()].filter(
    (p) =>
      p.startsWith('.claude/') &&
      !p.startsWith('.claude/hooks/') &&
      !p.startsWith('.claude/skills/') &&
      p !== '.claude/settings.json',
  );
  if (misc.length > 0) steps.push(buildOverlayStep('claude-misc-overlay', misc, tree, 'misc'));

  return steps;
}

function buildSettingsMergeStep(settings: SettingsBase, preHash: Sha256 | undefined): Step {
  const op: Operation = {
    op: 'claude_settings_merge',
    additions: settings as unknown as Record<string, unknown>,
    ...(preHash !== undefined ? { pre_state_hash: preHash } : {}),
  };
  return {
    id: 'claude-settings-merge',
    category: 'merge-claude-kit',
    title: 'Merge .claude/settings.json',
    commit_message: 'chore: merge .claude/settings.json',
    preconditions: [],
    operations: [op],
    commit_paths: ['.claude/settings.json'],
  };
}

function buildClaudeMdSnapshotStep(
  tree: OverlayTree,
  userKit: ClaudeKitSnapshot,
  preHash: Sha256 | undefined,
): Step {
  const operations: Operation[] = [];
  if (userKit.has_claude_md) {
    operations.push({
      op: 'rename_file',
      from: 'CLAUDE.md',
      to: 'CLAUDE.pre-janus.md',
      ...(preHash !== undefined ? { pre_state_hash: preHash } : {}),
    });
  }
  const entry = tree.get('CLAUDE.md');
  if (!entry) throw new Error('overlay tree missing CLAUDE.md');
  const janusContent = entry.content.toString('utf8');
  if (!janusContent.startsWith('@AGENTS.md\n')) {
    throw new Error('CLAUDE_TEMPLATE_UNEXPECTED_HEAD');
  }
  const finalContent = userKit.has_claude_md
    ? janusContent.replace(/^(@AGENTS\.md\n)/, '$1@CLAUDE.pre-janus.md\n')
    : janusContent;
  operations.push({
    op: 'write_file',
    path: 'CLAUDE.md',
    content: finalContent,
    overwrite: true,
  });
  const commit_paths = userKit.has_claude_md ? ['CLAUDE.md', 'CLAUDE.pre-janus.md'] : ['CLAUDE.md'];
  return {
    id: 'claude-md-snapshot',
    category: 'merge-claude-kit',
    title: 'Snapshot existing CLAUDE.md and overlay janus version',
    commit_message: 'chore: snapshot CLAUDE.md and overlay janus version',
    preconditions: [],
    operations,
    commit_paths,
  };
}

function buildOverlayStep(id: string, paths: string[], tree: OverlayTree, label: string): Step {
  paths.sort();
  const operations: Operation[] = paths.map((p) => {
    const entry = tree.get(p);
    if (!entry) throw new Error(`overlay tree missing entry for ${p}`);
    const includeMode = entry.mode !== 0o644;
    return {
      op: 'write_file',
      path: p,
      content: entry.content.toString('utf8'),
      ...(includeMode ? { mode: entry.mode } : {}),
      overwrite: true,
    };
  });
  return {
    id,
    category: 'merge-claude-kit',
    title: `Overlay janus .claude/${label}`,
    commit_message: `chore: overlay janus .claude/${label}`,
    preconditions: [],
    operations,
    commit_paths: [...paths],
  };
}

function listEntries(tree: OverlayTree, prefix: string): string[] {
  return [...tree.keys()].filter((p) => p.startsWith(prefix));
}
