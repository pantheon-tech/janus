import { describe, expect, it } from 'vitest';
import { generateWriteMarkerStep } from './write-marker.js';

describe('generateWriteMarkerStep', () => {
  it('emits a write_file op for .janus.json with overwrite: true', () => {
    const step = generateWriteMarkerStep();
    expect(step.id).toBe('write-marker');
    expect(step.category).toBe('write-marker');
    expect(step.commit_paths).toEqual(['.janus.json']);
    const op = step.operations[0];
    expect(op?.op).toBe('write_file');
    expect((op as { path: string }).path).toBe('.janus.json');
    expect((op as { overwrite?: boolean }).overwrite).toBe(true);
  });
});
