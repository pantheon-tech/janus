import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { JanusError } from '../../errors.js';
import type { Operation } from '../../types/index.js';

export async function applyWriteFile(
  op: Extract<Operation, { op: 'write_file' }>,
  ctx: { repoRoot: string },
): Promise<void> {
  const full = join(ctx.repoRoot, op.path);
  if (existsSync(full) && !op.overwrite) {
    throw new JanusError(
      'PRE_STATE_HASH_MISMATCH',
      `file exists and overwrite not set: ${op.path}`,
    );
  }
  if (op.pre_state_hash && existsSync(full)) {
    const actual = `sha256:${createHash('sha256').update(readFileSync(full)).digest('hex')}`;
    if (actual !== op.pre_state_hash) {
      throw new JanusError(
        'PRE_STATE_HASH_MISMATCH',
        `pre_state_hash mismatch on ${op.path}: expected ${op.pre_state_hash}, got ${actual}`,
      );
    }
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, op.content, { mode: op.mode ?? 0o644 });
}
