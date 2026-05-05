import type {
  Archetype,
  BaselineFileStatus,
  ClaudeKitSnapshot,
  DepVersionConflict,
  OverlayResult,
  PackageJsonSnapshot,
  Plan,
  WorkflowFile,
} from '../types/index.js';
import { buildSettingsBase, type SettingsBase } from './steps/settings-base.js';

type Warning = Plan['payload']['warnings'][number];

const JANUS_SCRIPTS = new Set([
  'lint',
  'format',
  'check',
  'build',
  'test',
  'dev',
  'deploy:staging',
  'deploy:prod',
  'prepare',
]);

const JANUS_WORKFLOWS = new Set([
  '.github/workflows/ci.yml',
  '.github/workflows/deploy.yml',
  '.github/workflows/infra-preview.yml',
  '.github/workflows/claude-autofix.yml',
]);

export type CollectWarningsInput = {
  snapshot: {
    ci_workflows: WorkflowFile[];
    unrecognized_tools: string[];
    dep_version_conflicts: DepVersionConflict[];
    claude_kit: ClaudeKitSnapshot;
    package_json?: PackageJsonSnapshot;
  };
  baseline_files: BaselineFileStatus[];
  overlay: OverlayResult;
  archetype: Archetype;
  plugins: string[];
  /** raw parsed user settings.json (undefined if absent). Mirrors snapshot.claude_kit.settings_json. */
  user_settings_json?: unknown;
  /** Optional convenience pass-through for MODULE_TYPE_CHANGE / PKG_FIELDS_OVERWRITTEN. */
  package_json?: PackageJsonSnapshot;
};

export function collectWarnings(input: CollectWarningsInput): Warning[] {
  const ws: Warning[] = [];
  const pkg = input.package_json ?? input.snapshot.package_json;

  if (pkg && pkg.type !== 'module') {
    const from = pkg.type ?? 'unset';
    ws.push({
      code: 'MODULE_TYPE_CHANGE',
      message: `package.json type will change from '${from}' to 'module'`,
      evidence: ['package.json:type'],
    });
  }

  if (pkg?.scripts) {
    for (const [name, value] of Object.entries(pkg.scripts)) {
      if (JANUS_SCRIPTS.has(name)) {
        ws.push({
          code: 'PKG_FIELDS_OVERWRITTEN',
          message: `package.json:scripts.${name} will be overwritten ('${value}' → janus version)`,
          evidence: [`package.json:scripts.${name}`],
        });
      }
    }
  }

  for (const wf of input.snapshot.ci_workflows ?? []) {
    if (JANUS_WORKFLOWS.has(wf.path)) continue;
    if (wf.references_displaced_tool.length === 0) continue;
    ws.push({
      code: 'WORKFLOW_REFERENCES_DISPLACED_TOOL',
      message: `${wf.path} references displaced tool(s): ${wf.references_displaced_tool.join(', ')}`,
      evidence: [wf.path],
    });
  }

  for (const t of input.snapshot.unrecognized_tools ?? []) {
    ws.push({
      code: 'UNKNOWN_TOOL',
      message: `${t} detected; not migrated`,
      evidence: [`package.json:devDependencies.${t}`],
    });
  }

  for (const b of input.baseline_files) {
    if (!b.path.startsWith('.claude/')) continue;
    if (b.status !== 'present_differs') continue;
    if (!input.overlay.tree.has(b.path)) continue;
    ws.push({
      code: 'WARN_OVERWRITE_USER_KIT',
      message: `.claude/${b.path.slice('.claude/'.length)} will be overwritten by janus version`,
      evidence: [b.path],
    });
  }

  if (input.archetype !== 'monorepo-root') {
    ws.push({
      code: 'INSTALL_DEPS_MAY_FAIL',
      message:
        'pnpm install may fail on peer-dep / registry / network issues; lockfile and node_modules left dirty if so',
      evidence: [],
    });
  }

  for (const c of input.snapshot.dep_version_conflicts ?? []) {
    ws.push({
      code: 'DEP_VERSION_CONFLICT',
      message: `${c.name}: janus pins ${c.janus_range}, user has ${c.user_range} (no overlap)`,
      evidence: [`package.json:devDependencies.${c.name}`],
    });
  }

  const userSettings = (input.user_settings_json ?? input.snapshot.claude_kit?.settings_json) as
    | Record<string, unknown>
    | undefined;
  if (userSettings && typeof userSettings === 'object') {
    const janus = buildSettingsBase({ workload: '_compare_', plugins: input.plugins });
    ws.push(...settingsPermissionRedundancies(janus, userSettings));
    ws.push(...settingsHookConflicts(janus, userSettings));
    ws.push(...settingsScalarConflicts(janus, userSettings));
  }

  return ws;
}

function settingsPermissionRedundancies(
  janus: SettingsBase,
  user: Record<string, unknown>,
): Warning[] {
  const out: Warning[] = [];
  const userPerms = (user.permissions as { allow?: string[]; deny?: string[] } | undefined) ?? {};
  for (const kind of ['allow', 'deny'] as const) {
    const userList = userPerms[kind] ?? [];
    const janusList = janus.permissions?.[kind] ?? [];
    for (const j of janusList) {
      const match = userList.find((u) => u === j);
      if (match !== undefined) {
        out.push({
          code: 'SETTINGS_PERMISSION_REDUNDANT',
          message: `${j} is redundant with existing ${match}`,
          evidence: [`.claude/settings.json:permissions.${kind}`],
        });
      }
    }
  }
  return out;
}

function settingsHookConflicts(janus: SettingsBase, user: Record<string, unknown>): Warning[] {
  const out: Warning[] = [];
  const userHooks =
    (user.hooks as
      | Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>
      | undefined) ?? {};
  const janusHooks = janus.hooks ?? {};
  for (const [event, janusEntries] of Object.entries(janusHooks)) {
    const userEntries = userHooks[event] ?? [];
    for (const je of janusEntries) {
      for (const ue of userEntries) {
        const sameMatcher = (je.matcher ?? '') === (ue.matcher ?? '');
        if (!sameMatcher) continue;
        const jcmd = je.hooks[0]?.command ?? '';
        const ucmd = ue.hooks[0]?.command ?? '';
        if (jcmd && ucmd && basename(jcmd) !== basename(ucmd)) {
          out.push({
            code: 'SETTINGS_HOOK_CONFLICT',
            message: `janus hook ${jcmd} conflicts with user hook ${ucmd} on event ${event}; keeping user`,
            evidence: [`.claude/settings.json:hooks.${event}`],
          });
        }
      }
    }
  }
  return out;
}

function basename(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function settingsScalarConflicts(janus: SettingsBase, user: Record<string, unknown>): Warning[] {
  const out: Warning[] = [];
  const SCALAR_FIELDS: Array<keyof SettingsBase> = ['cleanupPeriodDays'];
  for (const field of SCALAR_FIELDS) {
    const j = (janus as Record<string, unknown>)[field as string];
    const u = user[field as string];
    if (j === undefined) continue;
    if (u === undefined) continue;
    if (u === j) continue;
    out.push({
      code: 'SETTINGS_SCALAR_CONFLICT',
      message: `${String(field)}: user value ${JSON.stringify(u)} preserved; janus default ${JSON.stringify(j)} not applied`,
      evidence: [`.claude/settings.json:${String(field)}`],
    });
  }
  return out;
}
