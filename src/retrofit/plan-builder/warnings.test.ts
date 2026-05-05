import { describe, expect, it } from 'vitest';
import type {
  BaselineFileStatus,
  ClaudeKitSnapshot,
  OverlayResult,
  OverlayTree,
  PackageJsonSnapshot,
  WorkflowFile,
} from '../types/index.js';
import { type CollectWarningsInput, collectWarnings } from './warnings.js';

const emptyKit: ClaudeKitSnapshot = {
  has_claude_dir: false,
  has_settings_json: false,
  has_claude_md: false,
  has_pre_janus_md: false,
  hooks: [],
  skills: [],
  misc: [],
};

const baseSnap = (
  over: Partial<CollectWarningsInput['snapshot']> = {},
): CollectWarningsInput['snapshot'] => ({
  ci_workflows: [] as WorkflowFile[],
  unrecognized_tools: [] as string[],
  dep_version_conflicts: [],
  claude_kit: emptyKit,
  ...over,
});

const overlayWith = (paths: string[]): OverlayResult => {
  const tree: OverlayTree = new Map();
  for (const p of paths) tree.set(p, { content: Buffer.from('x'), mode: 0o644 });
  return { tree, gitignore_lines: [], archetype_only: new Set() };
};

describe('collectWarnings — existing four', () => {
  it('emits MODULE_TYPE_CHANGE when user pkg type is commonjs', () => {
    const pkg: PackageJsonSnapshot = { raw: {}, type: 'commonjs' };
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
      package_json: pkg,
    });
    expect(ws.find((w) => w.code === 'MODULE_TYPE_CHANGE')).toBeDefined();
  });

  it('emits MODULE_TYPE_CHANGE when user pkg has no type field', () => {
    const pkg: PackageJsonSnapshot = { raw: { name: 'p' } };
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
      package_json: pkg,
    });
    expect(ws.find((w) => w.code === 'MODULE_TYPE_CHANGE')).toBeDefined();
  });

  it('does NOT emit MODULE_TYPE_CHANGE when user pkg already module', () => {
    const pkg: PackageJsonSnapshot = { raw: {}, type: 'module' };
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
      package_json: pkg,
    });
    expect(ws.find((w) => w.code === 'MODULE_TYPE_CHANGE')).toBeUndefined();
  });

  it('emits PKG_FIELDS_OVERWRITTEN per overwritten script', () => {
    const pkg: PackageJsonSnapshot = {
      raw: {},
      type: 'module',
      scripts: { test: 'jest', lint: 'eslint .' },
    };
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
      package_json: pkg,
    });
    const overrides = ws.filter((w) => w.code === 'PKG_FIELDS_OVERWRITTEN');
    expect(overrides.length).toBeGreaterThanOrEqual(2);
  });

  it('emits WORKFLOW_REFERENCES_DISPLACED_TOOL for non-janus workflows that reference a tool', () => {
    const wf: WorkflowFile[] = [
      { path: '.github/workflows/qa.yml', references_displaced_tool: ['npm', 'eslint'] },
      { path: '.github/workflows/ci.yml', references_displaced_tool: [] },
    ];
    const ws = collectWarnings({
      snapshot: baseSnap({ ci_workflows: wf }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
    });
    const matched = ws.filter((w) => w.code === 'WORKFLOW_REFERENCES_DISPLACED_TOOL');
    expect(matched).toHaveLength(1);
    expect(matched[0]?.evidence).toEqual(['.github/workflows/qa.yml']);
  });

  it('does NOT emit WORKFLOW warning for janus-named workflows (overlay-replaces them)', () => {
    const wf: WorkflowFile[] = [
      { path: '.github/workflows/ci.yml', references_displaced_tool: ['eslint'] },
      { path: '.github/workflows/deploy.yml', references_displaced_tool: ['eslint'] },
    ];
    const ws = collectWarnings({
      snapshot: baseSnap({ ci_workflows: wf }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
    });
    expect(ws.filter((w) => w.code === 'WORKFLOW_REFERENCES_DISPLACED_TOOL')).toHaveLength(0);
  });

  it('emits UNKNOWN_TOOL per unrecognized tool', () => {
    const ws = collectWarnings({
      snapshot: baseSnap({ unrecognized_tools: ['lint-staged', 'turbo'] }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
    });
    expect(ws.filter((w) => w.code === 'UNKNOWN_TOOL')).toHaveLength(2);
  });
});

describe('collectWarnings — WARN_OVERWRITE_USER_KIT', () => {
  it('emits per .claude/* path that is present_differs and present in overlay', () => {
    const baseline: BaselineFileStatus[] = [
      { path: '.claude/skills/foo.md', status: 'present_differs', pre_state_hash: 'sha256:aa' },
      { path: '.claude/hooks/bar.sh', status: 'present_identical', pre_state_hash: 'sha256:bb' },
      { path: 'biome.jsonc', status: 'present_differs', pre_state_hash: 'sha256:cc' },
    ];
    const overlay = overlayWith(['.claude/skills/foo.md', '.claude/hooks/bar.sh', 'biome.jsonc']);
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: baseline,
      overlay,
      archetype: 'monorepo-root',
      plugins: [],
    });
    const overwrites = ws.filter((w) => w.code === 'WARN_OVERWRITE_USER_KIT');
    expect(overwrites).toHaveLength(1);
    expect(overwrites[0]?.evidence).toEqual(['.claude/skills/foo.md']);
  });
});

describe('collectWarnings — INSTALL_DEPS_MAY_FAIL', () => {
  it('emits when archetype !== monorepo-root', () => {
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
    });
    expect(ws.find((w) => w.code === 'INSTALL_DEPS_MAY_FAIL')).toBeDefined();
  });

  it('does NOT emit for monorepo-root', () => {
    const ws = collectWarnings({
      snapshot: baseSnap(),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
    });
    expect(ws.find((w) => w.code === 'INSTALL_DEPS_MAY_FAIL')).toBeUndefined();
  });
});

describe('collectWarnings — DEP_VERSION_CONFLICT', () => {
  it('emits per analyzer-detected conflict', () => {
    const ws = collectWarnings({
      snapshot: baseSnap({
        dep_version_conflicts: [
          { name: 'typescript', janus_range: '^5.7.0', user_range: '~4.9.0' },
          { name: 'vitest', janus_range: '^3.0.0', user_range: '^1.0.0' },
        ],
      }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'generic-ts',
      plugins: [],
    });
    const conflicts = ws.filter((w) => w.code === 'DEP_VERSION_CONFLICT');
    expect(conflicts).toHaveLength(2);
    expect(conflicts[0]?.evidence[0]).toMatch(/^package\.json:devDependencies\./);
  });
});

describe('collectWarnings — SETTINGS_PERMISSION_REDUNDANT', () => {
  it('emits per janus permission identical to user entry', () => {
    const userSettings = {
      permissions: { allow: ['Bash(pnpm *)', 'Read(**)'], deny: ['Bash(rm -rf *)'] },
    };
    const ws = collectWarnings({
      snapshot: baseSnap({ claude_kit: { ...emptyKit, settings_json: userSettings } }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
      user_settings_json: userSettings,
    });
    const reds = ws.filter((w) => w.code === 'SETTINGS_PERMISSION_REDUNDANT');
    expect(reds.length).toBeGreaterThanOrEqual(2);
    expect(reds[0]?.evidence[0]).toMatch(/^\.claude\/settings\.json:permissions\.(allow|deny)$/);
  });
});

describe('collectWarnings — SETTINGS_HOOK_CONFLICT', () => {
  it('emits when user hook command differs from janus on same event', () => {
    const userSettings = {
      hooks: {
        SessionStart: [
          {
            matcher: 'startup|clear|compact',
            hooks: [{ type: 'command', command: '/usr/local/bin/my-session-start.sh' }],
          },
        ],
      },
    };
    const ws = collectWarnings({
      snapshot: baseSnap({ claude_kit: { ...emptyKit, settings_json: userSettings } }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
      user_settings_json: userSettings,
    });
    const conflicts = ws.filter((w) => w.code === 'SETTINGS_HOOK_CONFLICT');
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0]?.evidence[0]).toBe('.claude/settings.json:hooks.SessionStart');
  });
});

describe('collectWarnings — SETTINGS_SCALAR_CONFLICT', () => {
  it('emits per top-level scalar where user differs from janus default', () => {
    const userSettings = { cleanupPeriodDays: 30, theme: 'dark' };
    const ws = collectWarnings({
      snapshot: baseSnap({ claude_kit: { ...emptyKit, settings_json: userSettings } }),
      baseline_files: [],
      overlay: overlayWith([]),
      archetype: 'monorepo-root',
      plugins: [],
      user_settings_json: userSettings,
    });
    const scalars = ws.filter((w) => w.code === 'SETTINGS_SCALAR_CONFLICT');
    expect(scalars).toHaveLength(1);
    expect(scalars[0]?.evidence[0]).toBe('.claude/settings.json:cleanupPeriodDays');
  });
});
