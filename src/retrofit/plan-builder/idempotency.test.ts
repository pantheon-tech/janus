import { describe, expect, it } from 'vitest';
import type { BaselineFileStatus, Operation, PackageJsonSnapshot } from '../types/index.js';
import { shouldEmit } from './idempotency.js';

const baseStatus = (over: Partial<BaselineFileStatus> = {}): BaselineFileStatus => ({
  path: 'foo.txt',
  status: 'missing',
  ...over,
});

describe('shouldEmit', () => {
  it('write_file: omits present_identical', () => {
    const op: Operation = { op: 'write_file', path: 'foo.txt', content: 'x' };
    const baseline = [baseStatus({ status: 'present_identical' })];
    expect(shouldEmit(op, { baseline_files: baseline })).toBe(false);
  });

  it('write_file: emits missing', () => {
    const op: Operation = { op: 'write_file', path: 'foo.txt', content: 'x' };
    const baseline = [baseStatus({ status: 'missing' })];
    expect(shouldEmit(op, { baseline_files: baseline })).toBe(true);
  });

  it('write_file: emits present_differs', () => {
    const op: Operation = { op: 'write_file', path: 'foo.txt', content: 'x' };
    const baseline = [baseStatus({ status: 'present_differs' })];
    expect(shouldEmit(op, { baseline_files: baseline })).toBe(true);
  });

  it('delete_file: omits when path is already absent', () => {
    const op: Operation = { op: 'delete_file', path: 'gone.txt' };
    const baseline = [baseStatus({ path: 'gone.txt', status: 'missing' })];
    expect(shouldEmit(op, { baseline_files: baseline })).toBe(false);
  });

  it('json_remove: omits when pointer already absent', () => {
    const op: Operation = { op: 'json_remove', path: 'package.json', pointer: '/scripts/test' };
    const pkg: PackageJsonSnapshot = { raw: { scripts: { lint: 'x' } } };
    expect(shouldEmit(op, { package_json: pkg })).toBe(false);
  });

  it('json_remove: emits when pointer is present', () => {
    const op: Operation = { op: 'json_remove', path: 'package.json', pointer: '/scripts/test' };
    const pkg: PackageJsonSnapshot = { raw: { scripts: { test: 'jest' } } };
    expect(shouldEmit(op, { package_json: pkg })).toBe(true);
  });

  it('json_set: omits when pointer already at target value', () => {
    const op: Operation = {
      op: 'json_set',
      path: 'package.json',
      pointer: '/type',
      value: 'module',
    };
    const pkg: PackageJsonSnapshot = { raw: { type: 'module' } };
    expect(shouldEmit(op, { package_json: pkg })).toBe(false);
  });

  it('chmod: omits when file already at target mode', () => {
    const op: Operation = { op: 'chmod', path: 'a.sh', mode: 0o755 };
    const baseline = [
      baseStatus({ path: 'a.sh', status: 'present_identical', current_mode: 0o755 }),
    ];
    expect(shouldEmit(op, { baseline_files: baseline })).toBe(false);
  });

  it('shell: never omitted', () => {
    const op: Operation = { op: 'shell', command: 'pnpm install' };
    expect(shouldEmit(op, {})).toBe(true);
  });
});
