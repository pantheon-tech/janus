export const ERROR_CODES = [
  // diagnose pre-flight (#1-#8)
  'NOT_IN_GIT_REPO',
  'INVALID_ARCHETYPE',
  'MARKER_INVALID',
  'TOOL_MISSING',
  'HAS_SUBMODULES',
  'TARGET_PATH_SYMLINK',
  'CASE_COLLISION',
  'INVOKED_FROM_WORKSPACE_MEMBER',
  // retrofit pre-flight (#9-#16)
  'PLAN_FILE_INVALID',
  'PLAN_SCHEMA_INVALID',
  'SCHEMA_VERSION_MISMATCH',
  'REPO_ROOT_MISMATCH',
  'TREE_DIRTY',
  'HEAD_DETACHED',
  'TARGET_BRANCH_EXISTS',
  'BRANCH_SUGGESTION_EXHAUSTED',
  'REMOTE_UNREACHABLE',
  'INVOKED_FROM_WORKTREE',
  // execution
  'PRE_STATE_HASH_MISMATCH',
  'PRE_STATE_HASH_MISSING_FILE',
  'EXTRANEOUS_FILE_MODIFICATIONS',
  'GITIGNORE_BLOCK_MALFORMED',
  'CLAUDE_PRE_JANUS_EXISTS',
  'CLAUDE_TEMPLATE_UNEXPECTED_HEAD',
  'SHELL_NOT_WHITELISTED',
  'COMMIT_HOOK_FAILED',
  // resolvers (Plan 2 throws these)
  'SLOT_VALIDATION_FAILED',
  'SLOT_UNRESOLVED_NON_INTERACTIVE',
  // generic
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
export class JanusError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly remediation?: string,
  ) {
    super(message);
    this.name = 'JanusError';
  }
}
// Plan 5's retrofit-cmd uses this to map to exit code 2.
export const MID_EXECUTION_CODES: ReadonlySet<ErrorCode> = new Set([
  'PRE_STATE_HASH_MISMATCH',
  'PRE_STATE_HASH_MISSING_FILE',
  'EXTRANEOUS_FILE_MODIFICATIONS',
  'GITIGNORE_BLOCK_MALFORMED',
  'CLAUDE_PRE_JANUS_EXISTS',
  'CLAUDE_TEMPLATE_UNEXPECTED_HEAD',
  'SHELL_NOT_WHITELISTED',
  'COMMIT_HOOK_FAILED',
]);
