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
