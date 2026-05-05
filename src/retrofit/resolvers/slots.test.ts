import { describe, expect, it } from 'vitest';
import type { JanusMarker, RepoSnapshot } from '../types/index.js';
import { resolveSlots } from './slots.js';

const baseSnap = (over: Partial<RepoSnapshot> = {}): Omit<RepoSnapshot, 'baseline_files'> => ({
  repo_root: '/tmp/x',
  has_janus_marker: false,
  package_manager: 'none',
  lockfiles_present: [],
  has_package_json: false,
  displaced_tools: [],
  claude_kit: {
    has_claude_dir: false,
    has_settings_json: false,
    has_claude_md: false,
    has_pre_janus_md: false,
    hooks: [],
    skills: [],
    misc: [],
  },
  ci_workflows: [],
  unrecognized_tools: [],
  plugin_evidence: {
    'frontend-design@claude-plugins-official': [],
    'playwright@claude-plugins-official': [],
    'pyright-lsp@claude-plugins-official': [],
  },
  git: { head_branch: 'main', is_tracking: false, tree_clean: true, has_submodules: false },
  remote: {},
  ...over,
});

describe('resolveSlots', () => {
  it('uses --slot overrides as authoritative', async () => {
    const snap = baseSnap();
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: { workload: 'foo', author: 'X', author_email: 'x@y.com', github_org: 'org' },
      nonInteractive: true,
    });
    expect(slots.workload).toBe('foo');
    expect(slots.archetype).toBe('generic-ts');
    expect(slots.author).toBe('X');
    expect(slots.author_email).toBe('x@y.com');
    expect(slots.license).toBe('MIT');
    expect(slots.region).toBe('australiaeast');
  });

  it('auto-sources author from package.json string form', async () => {
    const snap = baseSnap({
      has_package_json: true,
      package_json: { raw: {}, author: 'Daniel Smith <daniel@skipper.kiwi>' },
    });
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: { workload: 'foo', github_org: 'org' },
      nonInteractive: true,
    });
    expect(slots.author).toBe('Daniel Smith');
    expect(slots.author_email).toBe('daniel@skipper.kiwi');
  });

  it('auto-sources author from package.json object form', async () => {
    const snap = baseSnap({
      has_package_json: true,
      package_json: { raw: {}, author: { name: 'Jane', email: 'jane@example.com' } },
    });
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: { workload: 'foo', github_org: 'org' },
      nonInteractive: true,
    });
    expect(slots.author).toBe('Jane');
    expect(slots.author_email).toBe('jane@example.com');
  });

  it('auto-sources github_org and workload from remote.parsed', async () => {
    const snap = baseSnap({
      remote: {
        origin_url: 'https://github.com/pantheon-tech/foo.git',
        parsed: { host: 'github.com', org: 'pantheon-tech', repo: 'foo' },
      },
    });
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: { author: 'X', author_email: 'x@y.com' },
      nonInteractive: true,
    });
    expect(slots.github_org).toBe('pantheon-tech');
    expect(slots.workload).toBe('foo');
  });

  it('uses prior marker slots first', async () => {
    const prior: JanusMarker = {
      schema_version: '1',
      janus_version: '0.1.0',
      archetype: 'generic-ts',
      applied_at: '2026-01-01T00:00:00Z',
      applied_steps: [],
      skipped_steps: [],
      slots: {
        workload: 'fromprior',
        description: 'p',
        archetype: 'generic-ts',
        github_org: 'priororg',
        author: 'P',
        author_email: 'p@p.com',
        node_version: '22',
        license: 'MIT',
        region: 'australiaeast',
        template_version: 'v0.1.0',
        year: '2026',
        date: '2026-01-01',
        base_branch: 'staging',
      },
      plugins: [],
      shared_overlay_version: '0.1.0',
      archetype_overlay_version: '0.1.0',
    };
    const snap = baseSnap({ has_janus_marker: true, prior_marker: prior });
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: {},
      nonInteractive: true,
    });
    expect(slots.workload).toBe('fromprior');
    expect(slots.github_org).toBe('priororg');
  });

  it('falls back to prompt callback when interactive', async () => {
    const snap = baseSnap();
    const prompted: string[] = [];
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: {},
      nonInteractive: false,
      prompt: async (key) => {
        prompted.push(key);
        if (key === 'workload') return 'foo';
        if (key === 'github_org') return 'org';
        if (key === 'author') return 'X';
        if (key === 'author_email') return 'x@y.com';
        if (key === 'description') return 'd';
        return '';
      },
    });
    expect(prompted).toEqual(
      expect.arrayContaining(['workload', 'github_org', 'author', 'author_email']),
    );
    expect(slots.workload).toBe('foo');
  });

  it('throws SLOT_UNRESOLVED_NON_INTERACTIVE when --non-interactive and a slot is missing', async () => {
    const snap = baseSnap();
    await expect(
      resolveSlots({
        snapshot: snap,
        archetype: 'generic-ts',
        cliSlots: {},
        nonInteractive: true,
      }),
    ).rejects.toThrow(/SLOT_UNRESOLVED_NON_INTERACTIVE/);
  });

  it('throws SLOT_VALIDATION_FAILED when --slot value fails regex', async () => {
    const snap = baseSnap();
    await expect(
      resolveSlots({
        snapshot: snap,
        archetype: 'generic-ts',
        cliSlots: { workload: 'BadCase' },
        nonInteractive: true,
      }),
    ).rejects.toThrow(/SLOT_VALIDATION_FAILED/);
  });

  it('falls back from invalid auto-sourced value to prompt under interactive', async () => {
    const snap = baseSnap({
      has_package_json: true,
      package_json: { raw: {}, author: 'X', description: 'd', engines: { node: 'lts/iron' } },
    });
    const slots = await resolveSlots({
      snapshot: snap,
      archetype: 'generic-ts',
      cliSlots: { workload: 'foo', github_org: 'org', author_email: 'x@y.com' },
      nonInteractive: false,
      prompt: async (key) => (key === 'node_version' ? '22' : ''),
    });
    expect(slots.node_version).toBe('22');
  });
});
