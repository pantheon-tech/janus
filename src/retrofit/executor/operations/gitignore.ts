import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JanusError } from '../../errors.js';
import type { Operation } from '../../types/index.js';

const BEGIN = '# --- janus baseline (managed by janus retrofit; do not edit) ---';
const END = '# --- end janus baseline ---';
const GITIGNORE_REL = '.gitignore';

export function applyGitignoreMerge(
  op: Extract<Operation, { op: 'gitignore_merge' }>,
  ctx: { repoRoot: string },
): void {
  const full = join(ctx.repoRoot, GITIGNORE_REL);
  const existing = existsSync(full) ? readFileSync(full, 'utf8') : '';
  if (op.pre_state_hash && existing) {
    const actual = `sha256:${createHash('sha256').update(existing, 'utf8').digest('hex')}`;
    if (actual !== op.pre_state_hash) {
      throw new JanusError(
        'PRE_STATE_HASH_MISMATCH',
        `pre_state_hash mismatch on ${GITIGNORE_REL}`,
      );
    }
  }

  const lines = existing.split('\n');
  const beginIdx = lines.indexOf(BEGIN);
  const endIdx = lines.indexOf(END);
  const beginCount = lines.filter((l) => l === BEGIN).length;
  const endCount = lines.filter((l) => l === END).length;

  if ((beginIdx === -1) !== (endIdx === -1)) {
    throw new JanusError('GITIGNORE_BLOCK_MALFORMED', 'one marker present without its pair');
  }
  if (beginCount > 1 || endCount > 1) {
    throw new JanusError('GITIGNORE_BLOCK_MALFORMED', 'duplicate markers');
  }
  if (beginIdx !== -1 && endIdx !== -1 && beginIdx > endIdx) {
    throw new JanusError('GITIGNORE_BLOCK_MALFORMED', 'markers in reverse order');
  }

  let out: string;
  if (beginIdx === -1) {
    const block = `${BEGIN}\n${op.lines.join('\n')}\n${END}`;
    const trimmed = existing.replace(/\n+$/, '');
    out = trimmed.length > 0 ? `${trimmed}\n\n${block}\n` : `${block}\n`;
  } else {
    const before = lines.slice(0, beginIdx);
    const after = lines.slice(endIdx + 1);
    out = [...before, BEGIN, ...op.lines, END, ...after].join('\n');
    if (!out.endsWith('\n')) out += '\n';
  }
  writeFileSync(full, out);
}
