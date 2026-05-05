import { JanusError } from '../../errors.js';
import type { Operation } from '../../types/index.js';
import { applyClaudeSettingsMerge } from './claude-settings.js';
import { applyChmod, applyDeleteDirectory, applyDeleteFile, applyRenameFile } from './fs.js';
import { applyGitignoreMerge } from './gitignore.js';
import { applyJsonMerge, applyJsonRemove, applyJsonRemoveMatching, applyJsonSet } from './json.js';
import { applyShell } from './shell.js';
import { applyWriteFile } from './write-file.js';

export type ApplyOpCtx = { repoRoot: string };

export async function applyOperation(op: Operation, ctx: ApplyOpCtx): Promise<void> {
  switch (op.op) {
    case 'write_file':
      return applyWriteFile(op, ctx);
    case 'delete_file':
      return applyDeleteFile(op, ctx);
    case 'delete_directory':
      return applyDeleteDirectory(op, ctx);
    case 'rename_file':
      return applyRenameFile(op, ctx);
    case 'chmod':
      return applyChmod(op, ctx);
    case 'json_set':
      return applyJsonSet(op, ctx);
    case 'json_remove':
      return applyJsonRemove(op, ctx);
    case 'json_remove_matching':
      return applyJsonRemoveMatching(op, ctx);
    case 'json_merge':
      return applyJsonMerge(op, ctx);
    case 'claude_settings_merge':
      return applyClaudeSettingsMerge(op, ctx);
    case 'gitignore_merge':
      return applyGitignoreMerge(op, ctx);
    case 'shell':
      return applyShell(op, ctx);
    default: {
      throw new JanusError(
        'PLAN_SCHEMA_INVALID',
        `unknown operation '${(op as { op: string }).op}' — plan schema should have rejected this earlier`,
      );
    }
  }
}
