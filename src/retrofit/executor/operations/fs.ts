import { chmodSync, existsSync, renameSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { JanusError } from '../../errors.js';
import type { Operation } from '../../types/index.js';

export function applyDeleteFile(
  op: Extract<Operation, { op: 'delete_file' }>,
  ctx: { repoRoot: string },
): void {
  const full = join(ctx.repoRoot, op.path);
  if (!existsSync(full)) {
    if (op.pre_state_hash) {
      throw new JanusError(
        'PRE_STATE_HASH_MISSING_FILE',
        `delete_file with pre_state_hash but file is missing: ${op.path}`,
      );
    }
    return; // silent no-op
  }
  unlinkSync(full);
}

export function applyDeleteDirectory(
  op: Extract<Operation, { op: 'delete_directory' }>,
  ctx: { repoRoot: string },
): void {
  const full = join(ctx.repoRoot, op.path);
  if (!existsSync(full)) return;
  rmSync(full, { recursive: true, force: true });
}

export function applyRenameFile(
  op: Extract<Operation, { op: 'rename_file' }>,
  ctx: { repoRoot: string },
): void {
  const from = join(ctx.repoRoot, op.from);
  const to = join(ctx.repoRoot, op.to);
  if (existsSync(to)) {
    throw new JanusError(
      'PRE_STATE_HASH_MISMATCH',
      `rename_file: destination ${op.to} already exists`,
    );
  }
  if (!existsSync(from)) {
    return; // already-renamed; idempotent
  }
  renameSync(from, to);
}

export function applyChmod(
  op: Extract<Operation, { op: 'chmod' }>,
  ctx: { repoRoot: string },
): void {
  const full = join(ctx.repoRoot, op.path);
  if (!existsSync(full)) return;
  chmodSync(full, op.mode);
}
