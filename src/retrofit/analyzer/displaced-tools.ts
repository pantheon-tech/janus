import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { DisplacedTool, PackageJsonSnapshot } from '../types/index.js';

type ToolName = DisplacedTool['name'];

type Rule = {
  tool: Exclude<ToolName, 'commitlint_old'>;
  evidence: string;
  match: (ctx: Ctx) => boolean;
};

type Ctx = {
  repoRoot: string;
  pkg: PackageJsonSnapshot | undefined;
};

const RULES: Rule[] = [
  // ESLint
  ...['.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yaml'].map((f) => ({
    tool: 'eslint' as const,
    evidence: f,
    match: (ctx: Ctx) => existsSync(join(ctx.repoRoot, f)),
  })),
  ...['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts'].map((f) => ({
    tool: 'eslint' as const,
    evidence: f,
    match: (ctx: Ctx) => existsSync(join(ctx.repoRoot, f)),
  })),
  {
    tool: 'eslint',
    evidence: 'package.json:devDependencies.eslint',
    match: (ctx) => Boolean(ctx.pkg?.devDependencies?.eslint),
  },
  {
    tool: 'eslint',
    evidence: 'package.json:eslintConfig',
    match: (ctx) => Boolean(ctx.pkg?.raw?.eslintConfig),
  },
  // Prettier
  ...[
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.yaml',
    '.prettierrc.yml',
    '.prettierrc.js',
  ].map((f) => ({
    tool: 'prettier' as const,
    evidence: f,
    match: (ctx: Ctx) => existsSync(join(ctx.repoRoot, f)),
  })),
  ...['prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs'].map((f) => ({
    tool: 'prettier' as const,
    evidence: f,
    match: (ctx: Ctx) => existsSync(join(ctx.repoRoot, f)),
  })),
  {
    tool: 'prettier',
    evidence: 'package.json:devDependencies.prettier',
    match: (ctx) => Boolean(ctx.pkg?.devDependencies?.prettier),
  },
  {
    tool: 'prettier',
    evidence: 'package.json:prettier',
    match: (ctx) => Boolean(ctx.pkg?.raw?.prettier),
  },
  // Husky
  {
    tool: 'husky',
    evidence: '.husky/',
    match: (ctx) => {
      const p = join(ctx.repoRoot, '.husky');
      return existsSync(p) && statSync(p).isDirectory();
    },
  },
  {
    tool: 'husky',
    evidence: 'package.json:devDependencies.husky',
    match: (ctx) => Boolean(ctx.pkg?.devDependencies?.husky),
  },
  // Jest
  ...[
    'jest.config.js',
    'jest.config.cjs',
    'jest.config.mjs',
    'jest.config.ts',
    'jest.config.json',
  ].map((f) => ({
    tool: 'jest' as const,
    evidence: f,
    match: (ctx: Ctx) => existsSync(join(ctx.repoRoot, f)),
  })),
  {
    tool: 'jest',
    evidence: 'package.json:devDependencies.jest',
    match: (ctx) => Boolean(ctx.pkg?.devDependencies?.jest),
  },
  {
    tool: 'jest',
    evidence: 'package.json:jest',
    match: (ctx) => Boolean(ctx.pkg?.raw?.jest),
  },
];

export function analyzeDisplacedTools(
  repoRoot: string,
  pkg: PackageJsonSnapshot | undefined,
): DisplacedTool[] {
  const ctx: Ctx = { repoRoot, pkg };
  const evidenceByTool = new Map<ToolName, string[]>();
  for (const rule of RULES) {
    if (rule.match(ctx)) {
      const arr = evidenceByTool.get(rule.tool) ?? [];
      arr.push(rule.evidence);
      evidenceByTool.set(rule.tool, arr);
    }
  }
  return [...evidenceByTool.entries()]
    .map(([name, evidence]) => ({ name, evidence }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
