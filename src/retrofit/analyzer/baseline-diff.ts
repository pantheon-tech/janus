import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { BaselineFileStatus, OverlayTree, Sha256 } from '../types/index.js';

export function baselineDiff(repoRoot: string, tree: OverlayTree): BaselineFileStatus[] {
  const out: BaselineFileStatus[] = [];
  for (const [path, entry] of tree.entries()) {
    const full = join(repoRoot, path);
    if (!existsSync(full)) {
      out.push({ path, status: 'missing' });
      continue;
    }
    const stat = statSync(full);
    if (!stat.isFile()) {
      out.push({ path, status: 'missing' });
      continue;
    }
    const content = readFileSync(full);
    const pre_state_hash = sha256Of(content);
    const current_mode = stat.mode & 0o777;
    const status: BaselineFileStatus['status'] =
      Buffer.compare(content, entry.content) === 0 ? 'present_identical' : 'present_differs';
    out.push({ path, status, pre_state_hash, current_mode });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function sha256Of(buf: Buffer): Sha256 {
  const hex = createHash('sha256').update(buf).digest('hex');
  return `sha256:${hex}` as Sha256;
}
