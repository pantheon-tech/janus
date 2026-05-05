import type { BaselineFileStatus, Operation, PackageJsonSnapshot } from '../types/index.js';

export type IdempotencyContext = {
  baseline_files?: BaselineFileStatus[];
  package_json?: PackageJsonSnapshot;
};

/**
 * Per-op omission rule (§6.8). Returns false when the op would have no
 * observable effect on the repo state and should therefore be dropped from
 * the plan. Returns true when the op should be emitted.
 *
 * For merge-style ops (`json_merge`, `claude_settings_merge`,
 * `gitignore_merge`) the caller is expected to compute the would-be merged
 * content and skip emitting the op directly when the result is byte-equal —
 * `shouldEmit` returns true conservatively so it does not silently mask a
 * needed merge.
 */
export function shouldEmit(op: Operation, ctx: IdempotencyContext): boolean {
  switch (op.op) {
    case 'write_file': {
      const status = baselineOf(ctx, op.path);
      if (!status) return true;
      return status.status !== 'present_identical';
    }
    case 'delete_file': {
      const status = baselineOf(ctx, op.path);
      if (!status) return true;
      return status.status !== 'missing';
    }
    case 'delete_directory':
    case 'rename_file':
      return true;
    case 'chmod': {
      const status = baselineOf(ctx, op.path);
      if (!status || status.status === 'missing') return true;
      return status.current_mode !== op.mode;
    }
    case 'json_set':
      return getPointer(ctx.package_json?.raw, op.pointer) !== op.value;
    case 'json_remove':
      return getPointer(ctx.package_json?.raw, op.pointer) !== undefined;
    case 'json_remove_matching':
      return getPointer(ctx.package_json?.raw, op.pointer) !== undefined;
    case 'json_merge':
    case 'claude_settings_merge':
    case 'gitignore_merge':
      return true;
    case 'shell':
      return true;
  }
}

function baselineOf(ctx: IdempotencyContext, path: string): BaselineFileStatus | undefined {
  return ctx.baseline_files?.find((b) => b.path === path);
}

/**
 * Resolve a JSON Pointer (RFC 6901) against an arbitrary JSON value.
 * Returns undefined if any segment is missing or traverses through a non-object.
 */
function getPointer(value: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) return value;
  const segments = pointer.slice(1).split('/').map(unescapePointer);
  let cur: unknown = value;
  for (const seg of segments) {
    if (cur === undefined || cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function unescapePointer(seg: string): string {
  return seg.replaceAll('~1', '/').replaceAll('~0', '~');
}
