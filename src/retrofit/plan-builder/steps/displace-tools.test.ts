import { describe, expect, it } from 'vitest';
import type { DisplacedTool } from '../../types/index.js';
import { generateDisplaceToolsSteps } from './displace-tools.js';

describe('generateDisplaceToolsSteps', () => {
  it('emits a displace-eslint step with delete + json_remove ops', () => {
    const tools: DisplacedTool[] = [
      { name: 'eslint', evidence: ['.eslintrc.json', 'package.json:devDependencies.eslint'] },
    ];
    const steps = generateDisplaceToolsSteps(tools);
    const eslint = steps.find((s) => s.id === 'displace-eslint');
    expect(eslint).toBeDefined();
    expect(eslint?.category).toBe('displace-tools');
    expect(eslint?.commit_message).toBe('chore: remove eslint in favor of biome');
    const opNames = eslint?.operations.map((o) => o.op) ?? [];
    expect(opNames).toContain('delete_file');
    expect(opNames).toContain('json_remove');
    expect(opNames).toContain('json_remove_matching');
    expect(eslint?.commit_paths).toContain('package.json');
  });

  it('emits separate steps for each tool', () => {
    const tools: DisplacedTool[] = [
      { name: 'prettier', evidence: ['.prettierrc'] },
      { name: 'jest', evidence: ['jest.config.js', 'package.json:devDependencies.jest'] },
    ];
    const steps = generateDisplaceToolsSteps(tools);
    expect(steps.map((s) => s.id).sort()).toEqual(['displace-jest', 'displace-prettier']);
  });

  it('returns empty for no tools', () => {
    expect(generateDisplaceToolsSteps([])).toEqual([]);
  });
});
