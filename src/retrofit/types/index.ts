/**
 * Types matching the on-disk Plan and Marker JSON schemas.
 * Hand-written to mirror src/retrofit/schema/*.schema.json.
 * Drift between schema and type is caught at runtime by the validator
 * tests in src/retrofit/schema/validate.test.ts.
 */

export type Archetype =
  | 'generic-ts'
  | 'backend-functions'
  | 'backend-container-app'
  | 'frontend-vite-react'
  | 'mcp-server'
  | 'monorepo-root';

export type SlotMap = {
  workload: string;
  description: string;
  archetype: string;
  github_org: string;
  author: string;
  author_email: string;
  node_version: string;
  license: string;
  region: string;
  template_version: string;
  year: string;
  date: string;
  base_branch: string;
} & Record<string, string>;

export type PluginSet = string[];

export type Warning = {
  code: string;
  message: string;
  evidence: string[];
};

export type Precondition =
  | { type: 'file_exists'; path: string }
  | { type: 'file_absent'; path: string }
  | { type: 'json_pointer_equals'; path: string; pointer: string; value: unknown };

export type StepCategory =
  | 'displace-tools'
  | 'set-package-manager'
  | 'apply-shared-overlay'
  | 'apply-archetype-overlay'
  | 'merge-claude-kit'
  | 'install-deps'
  | 'write-marker';

export type Sha256 = `sha256:${string}`;

export const SHELL_WHITELIST = [
  'pnpm install',
  'pnpm dedupe',
  'git config --unset core.hooksPath',
  'find .git/hooks -type f -not -name "*.sample" -delete',
] as const;
export type ShellCommand = (typeof SHELL_WHITELIST)[number];

export type Operation =
  | {
      op: 'write_file';
      path: string;
      content: string;
      mode?: number;
      pre_state_hash?: Sha256;
      overwrite?: boolean;
    }
  | { op: 'delete_file'; path: string; pre_state_hash?: Sha256 }
  | { op: 'delete_directory'; path: string }
  | { op: 'rename_file'; from: string; to: string; pre_state_hash?: Sha256 }
  | { op: 'chmod'; path: string; mode: number }
  | { op: 'json_set'; path: string; pointer: string; value: unknown }
  | { op: 'json_remove'; path: string; pointer: string }
  | { op: 'json_remove_matching'; path: string; pointer: string; value_regex: string }
  | { op: 'json_remove_matching'; path: string; pointer: string; key_regex: string }
  | { op: 'json_merge'; path: string; pointer: string; value: Record<string, unknown> }
  | { op: 'claude_settings_merge'; additions: Record<string, unknown>; pre_state_hash?: Sha256 }
  | { op: 'gitignore_merge'; lines: string[]; pre_state_hash?: Sha256 }
  | { op: 'shell'; command: ShellCommand };

export type Step = {
  id: string;
  category: StepCategory;
  title: string;
  commit_message: string;
  preconditions: Precondition[];
  operations: Operation[];
  commit_paths: string[];
};

export type JanusMarker = {
  schema_version: '1';
  janus_version: string;
  archetype: Archetype;
  applied_at: string;
  applied_steps: string[];
  skipped_steps: string[];
  slots: SlotMap;
  plugins: PluginSet;
  shared_overlay_version: string;
  archetype_overlay_version: string;
};

export type Plan = {
  schema_version: '1';
  meta: {
    janus_version: string;
    generated_at: string;
  };
  payload: {
    repo_root: string;
    archetype: Archetype;
    target_branch: string;
    slots: SlotMap;
    plugins: PluginSet;
    prior_marker: JanusMarker | null;
    warnings: Warning[];
    steps: Step[];
  };
};

// ---- Plan 2: Analyzer + overlay types ----

export type PackageJsonSnapshot = {
  raw: Record<string, unknown>;
  type?: 'module' | 'commonjs';
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  author?: string | { name?: string; email?: string };
  description?: string;
  license?: string;
};

export type DisplacedTool = {
  name: 'eslint' | 'prettier' | 'husky' | 'jest' | 'commitlint_old';
  evidence: string[];
};

export type WorkflowFile = {
  path: string;
  references_displaced_tool: string[];
};

export type PluginEvidence = {
  'frontend-design@claude-plugins-official': string[];
  'playwright@claude-plugins-official': string[];
  'pyright-lsp@claude-plugins-official': string[];
};

export type ClaudeKitSnapshot = {
  has_claude_dir: boolean;
  has_settings_json: boolean;
  /**
   * Parsed contents of `.claude/settings.json` when `has_settings_json` is true
   * and the file is valid JSON. Left unset if the file is missing or malformed.
   */
  settings_json?: unknown;
  has_claude_md: boolean;
  has_pre_janus_md: boolean;
  hooks: string[];
  skills: string[];
  misc: string[];
};

export type DepVersionConflict = {
  name: string;
  janus_range: string;
  user_range: string;
};

export type BaselineFileStatus = {
  path: string;
  status: 'missing' | 'present_identical' | 'present_differs';
  pre_state_hash?: Sha256;
  current_mode?: number;
};

export type RepoSnapshot = {
  repo_root: string;
  has_janus_marker: boolean;
  prior_marker?: JanusMarker;
  package_manager: 'pnpm' | 'npm' | 'yarn' | 'none';
  lockfiles_present: string[];
  package_json?: PackageJsonSnapshot;
  has_package_json: boolean;
  workspace?: { type: 'pnpm'; packages: string[] };
  displaced_tools: DisplacedTool[];
  baseline_files: BaselineFileStatus[];
  claude_kit: ClaudeKitSnapshot;
  ci_workflows: WorkflowFile[];
  unrecognized_tools: string[];
  dep_version_conflicts: DepVersionConflict[];
  plugin_evidence: PluginEvidence;
  git: {
    head_branch: string;
    is_tracking: boolean;
    tree_clean: boolean;
    has_submodules: boolean;
  };
  remote: {
    origin_url?: string;
    parsed?: { host: string; org: string; repo: string };
  };
};

// ---- Plan 2: Overlay-tree types ----

export type OverlayEntry = {
  content: Buffer;
  mode: number;
};

export type OverlayTree = Map<string, OverlayEntry>;

// Sentinel returned by the overlay-tree builder for `.gitignore` when the
// user already has one — signals plan-builder to emit a `gitignore_merge`
// op rather than a `write_file` op.
export type GitignoreOverlayMarker = {
  kind: 'gitignore_merge';
  lines: string[];
};

export type OverlayResult = {
  tree: OverlayTree;
  gitignore_lines: string[];
  archetype_only: Set<string>;
};
