import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JanusError } from '../../errors.js';
import type { Operation } from '../../types/index.js';

function readJson(file: string): { json: unknown; trailingNewline: boolean } {
  const text = readFileSync(file, 'utf8');
  return { json: JSON.parse(text), trailingNewline: text.endsWith('\n') };
}

function writeJson(file: string, value: unknown, trailingNewline: boolean): void {
  const out = JSON.stringify(value, null, 2);
  writeFileSync(file, trailingNewline ? `${out}\n` : out);
}

function pointerSegments(pointer: string): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`bad pointer: ${pointer}`);
  return pointer
    .slice(1)
    .split('/')
    .map((s) => s.replaceAll('~1', '/').replaceAll('~0', '~'));
}

function setAtPointer(
  root: Record<string, unknown>,
  segments: string[],
  value: unknown,
): void {
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i] as string;
    if (typeof cur[seg] !== 'object' || cur[seg] === null) cur[seg] = {};
    cur = cur[seg] as Record<string, unknown>;
  }
  const last = segments[segments.length - 1] as string;
  cur[last] = value;
}

function removeAtPointer(root: Record<string, unknown>, segments: string[]): void {
  let cur: Record<string, unknown> | undefined = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i] as string;
    const next = cur?.[seg];
    if (typeof next !== 'object' || next === null) return;
    cur = next as Record<string, unknown>;
  }
  if (cur) {
    const last = segments[segments.length - 1] as string;
    delete cur[last];
  }
}

export function applyJsonSet(
  op: Extract<Operation, { op: 'json_set' }>,
  ctx: { repoRoot: string },
): void {
  const file = join(ctx.repoRoot, op.path);
  const { json, trailingNewline } = readJson(file);
  setAtPointer(json as Record<string, unknown>, pointerSegments(op.pointer), op.value);
  writeJson(file, json, trailingNewline);
}

export function applyJsonRemove(
  op: Extract<Operation, { op: 'json_remove' }>,
  ctx: { repoRoot: string },
): void {
  const file = join(ctx.repoRoot, op.path);
  const { json, trailingNewline } = readJson(file);
  removeAtPointer(json as Record<string, unknown>, pointerSegments(op.pointer));
  writeJson(file, json, trailingNewline);
}

export function applyJsonRemoveMatching(
  op: Extract<Operation, { op: 'json_remove_matching' }>,
  ctx: { repoRoot: string },
): void {
  const file = join(ctx.repoRoot, op.path);
  const { json, trailingNewline } = readJson(file);
  const segments = pointerSegments(op.pointer);
  let cur: Record<string, unknown> | undefined = json as Record<string, unknown>;
  for (const seg of segments) {
    const next = cur?.[seg];
    if (typeof next !== 'object' || next === null) return;
    cur = next as Record<string, unknown>;
  }
  if (!cur) return;
  const valueRegex = (op as { value_regex?: string }).value_regex;
  const keyRegex = (op as { key_regex?: string }).key_regex;
  for (const k of Object.keys(cur)) {
    if (valueRegex !== undefined) {
      const v = cur[k];
      if (typeof v === 'string' && new RegExp(valueRegex).test(v)) delete cur[k];
    } else if (keyRegex !== undefined) {
      if (new RegExp(keyRegex).test(k)) delete cur[k];
    }
  }
  writeJson(file, json, trailingNewline);
}

export function applyJsonMerge(
  _op: Extract<Operation, { op: 'json_merge' }>,
  _ctx: { repoRoot: string },
): never {
  // v0.1 plan-builder doesn't emit json_merge. Reserved for future use.
  throw new JanusError(
    'PLAN_SCHEMA_INVALID',
    'json_merge op is not implemented in v0.1; plan-builder should not emit it',
  );
}
